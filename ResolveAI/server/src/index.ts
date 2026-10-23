import 'dotenv/config';
import { app } from './app';
import { prisma } from './lib/prisma';
import { jwtSecret } from './middleware/auth';

jwtSecret();
const port = Number(process.env.PORT || 4000);
const server = app.listen(port, () => console.log(`ResolveAI API running at http://localhost:${port}`));
async function shutdown() { server.close(); await prisma.$disconnect(); }
process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
