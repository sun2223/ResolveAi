import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, HttpError } from '../lib/errors';
import { authenticate, AuthedRequest, issueToken } from '../middleware/auth';

export const authRouter = Router();
const credentials = z.object({ email: z.string().email().max(254).transform(x => x.trim().toLowerCase()), password: z.string().min(8).max(128) });
const selectUser = { id: true, name: true, email: true, role: true, teamId: true, createdAt: true } as const;

authRouter.post('/register', asyncHandler(async (req, res) => {
  const input = credentials.extend({ name: z.string().trim().min(2).max(80) }).parse(req.body);
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw new HttpError(409, 'Email already registered');
  const user = await prisma.user.create({ data: { email: input.email, name: input.name, passwordHash: await bcrypt.hash(input.password, 12) }, select: selectUser });
  res.status(201).json({ user, token: issueToken(user.id, user.role) });
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const input = credentials.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) throw new HttpError(401, 'Invalid credentials');
  const { passwordHash: _hidden, ...safe } = user;
  res.json({ user: safe, token: issueToken(user.id, user.role) });
}));

authRouter.get('/me', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: (req as AuthedRequest).identity.id }, select: selectUser });
  if (!user) throw new HttpError(401, 'User not found');
  res.json(user);
}));
