import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { canManageTicket, canViewTicket } from '../lib/permissions';
import { canChangeStatus } from '../lib/tickets';
import { analysisSchema } from '../ai/gemini';

describe('role-scoped tickets', () => {
  const ticket = { customerId: 'customer', assignedAgentId: 'agent' };
  it('permits the customer to view but not manage their ticket', () => {
    const user = { id: 'customer', role: Role.CUSTOMER };
    expect(canViewTicket(user, ticket)).toBe(true);
    expect(canManageTicket(user, ticket)).toBe(false);
  });
  it('blocks a different customer and unassigned agent', () => {
    expect(canViewTicket({ id: 'other', role: Role.CUSTOMER }, ticket)).toBe(false);
    expect(canViewTicket({ id: 'other', role: Role.AGENT }, ticket)).toBe(false);
  });
  it('permits the assigned agent and admin', () => {
    expect(canManageTicket({ id: 'agent', role: Role.AGENT }, ticket)).toBe(true);
    expect(canManageTicket({ id: 'admin', role: Role.ADMIN }, ticket)).toBe(true);
  });
});
describe('business rules', () => {
  it('rejects invalid status transitions', () => {
    expect(canChangeStatus('OPEN', 'RESOLVED')).toBe(false);
    expect(canChangeStatus('OPEN', 'IN_PROGRESS')).toBe(true);
  });
  it('validates AI output strictly', () => {
    const good = { category: 'PAYMENT', suggestedPriority: 'HIGH', sentiment: 'NEGATIVE', summary: 'Customer reports a duplicate payment', reason: 'Possible financial impact' };
    expect(analysisSchema.safeParse(good).success).toBe(true);
    expect(analysisSchema.safeParse({ ...good, category: 'HACKED' }).success).toBe(false);
    expect(analysisSchema.safeParse({ ...good, unexpected: true }).success).toBe(false);
  });
});
