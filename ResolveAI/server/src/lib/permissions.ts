import { Role } from '@prisma/client';
import type { Identity } from '../middleware/auth';
export interface TicketOwnerInfo { customerId: string; assignedAgentId: string | null; }
export function canViewTicket(user: Identity, ticket: TicketOwnerInfo) {
  return user.role === Role.ADMIN || (user.role === Role.CUSTOMER && user.id === ticket.customerId) ||
    (user.role === Role.AGENT && user.id === ticket.assignedAgentId);
}
export function canManageTicket(user: Identity, ticket: TicketOwnerInfo) {
  return user.role === Role.ADMIN || (user.role === Role.AGENT && user.id === ticket.assignedAgentId);
}
