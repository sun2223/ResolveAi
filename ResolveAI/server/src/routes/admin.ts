import { Router } from 'express';
import { Category, Prisma, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, HttpError } from '../lib/errors';
import { authenticate, requireRole } from '../middleware/auth';
export const adminRouter = Router();
adminRouter.use(authenticate, requireRole(Role.ADMIN));
adminRouter.get('/teams', asyncHandler(async (_req, res) => {
  res.json(await prisma.team.findMany({ orderBy: { name: 'asc' } }));
}));
adminRouter.get('/agents', asyncHandler(async (_req, res) => {
  res.json(await prisma.user.findMany({ where: { role: Role.AGENT }, select: { id: true, name: true, email: true, teamId: true, team: { select: { name: true } } }, orderBy: { name: 'asc' } }));
}));
adminRouter.post('/agents', asyncHandler(async (req, res) => {
  const input = z.object({ name: z.string().trim().min(2).max(80), email: z.string().email().transform(x => x.trim().toLowerCase()), password: z.string().min(12).max(128), teamId: z.string().uuid() }).parse(req.body);
  const team = await prisma.team.findUnique({ where: { id: input.teamId } });
  if (!team) throw new HttpError(404, 'Team not found');
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw new HttpError(409, 'Email already registered');
  const agent = await prisma.user.create({ data: { name: input.name, email: input.email, passwordHash: await bcrypt.hash(input.password, 12), role: Role.AGENT, teamId: input.teamId }, select: { id: true, name: true, email: true, role: true, teamId: true } });
  res.status(201).json(agent);
}));
adminRouter.get('/analytics', asyncHandler(async (_req, res) => {
  const [total, byStatus, byCategory, resolved] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticket.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['category'], _count: { _all: true } }),
    prisma.ticket.findMany({ where: { resolvedAt: { not: null } }, select: { createdAt: true, resolvedAt: true }, take: 2000 })
  ]);
  const averageHours = resolved.length ? Math.round((resolved.reduce((sum, t) => sum + ((t.resolvedAt!.getTime() - t.createdAt.getTime()) / 36e5), 0) / resolved.length) * 10) / 10 : null;
  res.json({ total, byStatus, byCategory, averageResolutionHours: averageHours, resolutionSample: resolved.length });
}));
