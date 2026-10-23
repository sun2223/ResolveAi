import { it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app';
it('health endpoint returns 200', async () => {
  const response = await request(app).get('/api/v1/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ok: true });
});
it('private endpoints reject missing tokens', async () => {
  const response = await request(app).get('/api/v1/tickets');
  expect(response.status).toBe(401);
});
