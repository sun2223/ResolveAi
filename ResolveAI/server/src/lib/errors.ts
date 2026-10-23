import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const asyncHandler = (fn: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
export const notFound: RequestHandler = (_req, _res, next) => next(new HttpError(404, 'Route not found'));
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ZodError) { res.status(400).json({ error: 'Invalid input', issues: error.flatten() }); return; }
  if (error instanceof HttpError) { res.status(error.status).json({ error: error.message }); return; }
  console.error('Unexpected error:', error);
  res.status(500).json({ error: 'Internal server error' });
};
