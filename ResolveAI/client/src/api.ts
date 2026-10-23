export type Role = 'CUSTOMER' | 'AGENT' | 'ADMIN';
export type Status = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type Category = 'PAYMENT' | 'DELIVERY' | 'ACCOUNT' | 'PRODUCT' | 'OTHER';
export interface User { id: string; name: string; email: string; role: Role; teamId?: string | null }
export interface Analysis { id: string; category: Category; suggestedPriority: Priority; sentiment: string; summary: string; reason: string; createdAt: string }
export interface Ticket {
  id: string; title: string; description: string; customerId: string; status: Status; priority: Priority; category: Category;
  assignedAgentId: string | null; createdAt: string; updatedAt: string;
  customer?: { id: string; name: string; email: string }; assignedAgent?: { id: string; name: string; email: string } | null;
  team?: { name: string } | null; analyses?: Analysis[]; _count?: { messages: number };
}
export interface Message { id: string; body: string; createdAt: string; senderId: string; sender: { id: string; name: string; role: Role } }
export interface Draft { id: string; body: string; status: 'DRAFT' | 'APPROVED' | 'REJECTED'; createdAt: string }
export interface Team { id: string; name: string }
export interface Agent { id: string; name: string; email: string; teamId: string | null; team: { name: string } | null }
export interface Analytics { total: number; byStatus: Array<{ status: Status; _count: { _all: number } }>; byCategory: Array<{ category: Category; _count: { _all: number } }>; averageResolutionHours: number | null; resolutionSample: number }
const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';
let token = sessionStorage.getItem('resolveai-token') || '';
export function setToken(value: string) { token = value; if (value) sessionStorage.setItem('resolveai-token', value); else sessionStorage.removeItem('resolveai-token'); }
export function hasToken() { return Boolean(token); }
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, { method: options.method || 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error(`HTTP ${response.status}: invalid server response`); }
  if (!response.ok) { const message = (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') ? data.error : `HTTP ${response.status}`; throw new Error(message); }
  return data as T;
}
