import type { Request, RequestHandler } from 'express';
import { Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { HttpError } from '../lib/errors';

export interface Identity { id: string; role: Role; }
export interface AuthedRequest extends Request { identity: Identity; }
export function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  return secret;
}
export const authenticate: RequestHandler = (req, _res, next) => {
  const match = /^Bearer (.+)$/i.exec(req.headers.authorization || '');
  if (!match) return next(new HttpError(401, 'Authentication required'));
  try {
    const value = jwt.verify(match[1], jwtSecret());
    if (typeof value !== 'object' || typeof value.sub !== 'string' || !Object.values(Role).includes(value.role as Role)) {
      throw new Error('Invalid token payload');
    }
    (req as AuthedRequest).identity = { id: value.sub, role: value.role as Role };
    next();
  } catch { next(new HttpError(401, 'Invalid or expired token')); }
};
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => roles.includes((req as AuthedRequest).identity.role)
    ? next() : next(new HttpError(403, 'Forbidden'));
}
export function issueToken(id: string, role: Role) {
  return jwt.sign({ role }, jwtSecret(), { subject: id, expiresIn: '8h' });
}
