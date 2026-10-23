import { Router } from 'express';
import { Category, DraftStatus, Priority, Role, TicketStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, HttpError } from '../lib/errors';
import { authenticate, AuthedRequest, requireRole } from '../middleware/auth';
import { canViewTicket, canManageTicket } from '../lib/permissions';
import { canChangeStatus } from '../lib/tickets';
import { classifyTicket, draftReply } from '../ai/gemini';

export const ticketRouter = Router();
ticketRouter.use(authenticate);
const uuid = z.string().uuid();
const ticketInput = z.object({ title: z.string().trim().min(5).max(140), description: z.string().trim().min(12).max(6000) });
const publicTicket = {
  customer: { select: { id: true, name: true, email: true } },
  assignedAgent: { select: { id: true, name: true, email: true } },
  team: { select: { id: true, name: true } },
  analyses: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  _count: { select: { messages: true } }
};
function userOf(req: Parameters<typeof authenticate>[0]) { return (req as AuthedRequest).identity; }
async function ticketFor(req: Parameters<typeof authenticate>[0], id: string, manage = false) {
  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) throw new HttpError(404, 'Ticket not found');
  const allowed = manage ? canManageTicket(userOf(req), ticket) : canViewTicket(userOf(req), ticket);
  if (!allowed) throw new HttpError(403, 'Forbidden');
  return ticket;
}
function checkAgent(req: Parameters<typeof authenticate>[0]) {
  if (userOf(req).role === Role.CUSTOMER) throw new HttpError(403, 'Agent or admin required');
}

ticketRouter.post('/', requireRole(Role.CUSTOMER), asyncHandler(async (req, res) => {
  const body = ticketInput.parse(req.body);
  const ticket = await prisma.ticket.create({ data: { ...body, customerId: userOf(req).id } });
  res.status(201).json(ticket);
}));

ticketRouter.get('/', asyncHandler(async (req, res) => {
  const input = z.object({
    status: z.nativeEnum(TicketStatus).optional(),
    category: z.nativeEnum(Category).optional(),
    priority: z.nativeEnum(Priority).optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(15)
  }).parse(req.query);
  const identity = userOf(req);
  const scoped: Prisma.TicketWhereInput = identity.role === Role.CUSTOMER ? { customerId: identity.id }
    : identity.role === Role.AGENT ? { assignedAgentId: identity.id } : {};
  const where: Prisma.TicketWhereInput = {
    ...scoped, status: input.status, category: input.category, priority: input.priority,
    ...(input.search ? { OR: [{ title: { contains: input.search, mode: 'insensitive' } }, { description: { contains: input.search, mode: 'insensitive' } }] } : {})
  };
  const [items, total] = await prisma.$transaction([
    prisma.ticket.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (input.page - 1) * input.limit, take: input.limit, include: publicTicket }),
    prisma.ticket.count({ where })
  ]);
  res.json({ items, total, page: input.page, pages: Math.ceil(total / input.limit) });
}));

ticketRouter.get('/:id', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  await ticketFor(req, id);
  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id }, include: publicTicket });
  res.json(ticket);
}));

ticketRouter.patch('/:id/status', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const { status } = z.object({ status: z.nativeEnum(TicketStatus) }).parse(req.body);
  const current = await ticketFor(req, id, true);
  if (!canChangeStatus(current.status, status)) throw new HttpError(409, `Cannot transition ${current.status} to ${status}`);
  const result = await prisma.$transaction(async tx => {
    const changed = await tx.ticket.updateMany({ where: { id, status: current.status }, data: { status, resolvedAt: status === TicketStatus.RESOLVED ? new Date() : status === TicketStatus.IN_PROGRESS || status === TicketStatus.OPEN ? null : undefined } });
    if (!changed.count) throw new HttpError(409, 'Ticket changed; refresh and retry');
    await tx.auditEvent.create({ data: { ticketId: id, actorId: userOf(req).id, action: 'STATUS_CHANGED', detail: `${current.status} -> ${status}` } });
    return tx.ticket.findUniqueOrThrow({ where: { id } });
  });
  res.json(result);
}));

ticketRouter.patch('/:id/assign', requireRole(Role.ADMIN), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const { agentId } = z.object({ agentId: uuid }).parse(req.body);
  const ticket = await ticketFor(req, id, true);
  const agent = await prisma.user.findUnique({ where: { id: agentId } });
  if (!agent || agent.role !== Role.AGENT || !agent.teamId) throw new HttpError(400, 'Agent must belong to a team');
  const result = await prisma.$transaction(async tx => {
    const changed = await tx.ticket.updateMany({ where: { id, assignedAgentId: ticket.assignedAgentId }, data: { assignedAgentId: agentId, teamId: agent.teamId } });
    if (!changed.count) throw new HttpError(409, 'Ticket assignment changed; refresh and retry');
    await tx.auditEvent.create({ data: { ticketId: id, actorId: userOf(req).id, action: 'ASSIGNED', detail: `Agent ${agentId}` } });
    return tx.ticket.findUniqueOrThrow({ where: { id } });
  });
  res.json(result);
}));

ticketRouter.patch('/:id/classification', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  await ticketFor(req, id, true);
  const { category, priority } = z.object({ category: z.nativeEnum(Category), priority: z.nativeEnum(Priority) }).parse(req.body);
  const updated = await prisma.$transaction(async tx => {
    const ticket = await tx.ticket.update({ where: { id }, data: { category, priority } });
    await tx.auditEvent.create({ data: { ticketId: id, actorId: userOf(req).id, action: 'CLASSIFIED', detail: `${category}, ${priority}` } });
    return ticket;
  });
  res.json(updated);
}));

ticketRouter.get('/:id/messages', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  await ticketFor(req, id);
  res.json(await prisma.message.findMany({ where: { ticketId: id }, include: { sender: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'asc' }, take: 200 }));
}));

ticketRouter.post('/:id/messages', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const body = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
  const ticket = await ticketFor(req, id);
  if (ticket.status === TicketStatus.CLOSED) throw new HttpError(409, 'Cannot message a closed ticket');
  const message = await prisma.message.create({ data: { ticketId: id, senderId: userOf(req).id, body: body.body }, include: { sender: { select: { id: true, name: true, role: true } } } });
  res.status(201).json(message);
}));

ticketRouter.get('/:id/analyses', asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  await ticketFor(req, id);
  res.json(await prisma.aiAnalysis.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'desc' }, take: 20 }));
}));

ticketRouter.post('/:id/analyze', asyncHandler(async (req, res) => {
  checkAgent(req);
  const id = uuid.parse(req.params.id);
  const ticket = await ticketFor(req, id, true);
  const result = await classifyTicket(ticket.title, ticket.description);
  const analysis = await prisma.aiAnalysis.create({ data: { ticketId: id, ...result, model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' } });
  res.status(201).json(analysis);
}));

ticketRouter.get('/:id/drafts', asyncHandler(async (req, res) => {
  checkAgent(req);
  const id = uuid.parse(req.params.id);
  await ticketFor(req, id, true);
  res.json(await prisma.aiDraft.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'desc' }, take: 20 }));
}));

ticketRouter.post('/:id/draft-reply', asyncHandler(async (req, res) => {
  checkAgent(req);
  const id = uuid.parse(req.params.id);
  const ticket = await ticketFor(req, id, true);
  if (ticket.status === TicketStatus.CLOSED) throw new HttpError(409, 'Ticket is closed');
  const history = await prisma.message.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'desc' }, take: 10 });
  const body = await draftReply(ticket.title, ticket.description, history.reverse().map(m => m.body));
  const draft = await prisma.aiDraft.create({ data: { ticketId: id, body } });
  res.status(201).json(draft);
}));

ticketRouter.post('/:id/drafts/:draftId/approve', asyncHandler(async (req, res) => {
  checkAgent(req);
  const id = uuid.parse(req.params.id);
  const draftId = uuid.parse(req.params.draftId);
  const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
  const ticket = await ticketFor(req, id, true);
  if (ticket.status === TicketStatus.CLOSED) throw new HttpError(409, 'Ticket is closed');
  const output = await prisma.$transaction(async tx => {
    const changed = await tx.aiDraft.updateMany({ where: { id: draftId, ticketId: id, status: DraftStatus.DRAFT }, data: { status: DraftStatus.APPROVED, approvedBy: userOf(req).id, body } });
    if (!changed.count) throw new HttpError(409, 'Draft already processed or not found');
    const message = await tx.message.create({ data: { ticketId: id, senderId: userOf(req).id, body } });
    await tx.auditEvent.create({ data: { ticketId: id, actorId: userOf(req).id, action: 'DRAFT_APPROVED', detail: `Draft ${draftId}` } });
    return message;
  });
  res.status(201).json(output);
}));

ticketRouter.post('/:id/drafts/:draftId/reject', asyncHandler(async (req, res) => {
  checkAgent(req);
  const id = uuid.parse(req.params.id);
  const draftId = uuid.parse(req.params.draftId);
  await ticketFor(req, id, true);
  const updated = await prisma.aiDraft.updateMany({ where: { id: draftId, ticketId: id, status: DraftStatus.DRAFT }, data: { status: DraftStatus.REJECTED } });
  if (!updated.count) throw new HttpError(409, 'Draft already processed or not found');
  res.json({ status: 'REJECTED' });
}));

ticketRouter.get('/:id/audit', requireRole(Role.ADMIN), asyncHandler(async (req, res) => {
  const id = uuid.parse(req.params.id);
  await ticketFor(req, id, true);
  res.json(await prisma.auditEvent.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'desc' }, take: 100 }));
}));
