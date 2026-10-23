import { TicketStatus } from '@prisma/client';
export const allowedTransitions: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: ['OPEN']
};
export function canChangeStatus(from: TicketStatus, to: TicketStatus) {
  return allowedTransitions[from].includes(to);
}
