import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
async function seed() {
  const names = ['Payment', 'Logistics', 'Technical Support', 'Product Support', 'General Support'];
  for (const name of names) await prisma.team.upsert({ where: { name }, update: {}, create: { name } });
  const general = await prisma.team.findUniqueOrThrow({ where: { name: 'General Support' } });
  for (const [role, emailName, passName, name] of [
    [Role.ADMIN, 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'Demo Admin'],
    [Role.AGENT, 'AGENT_EMAIL', 'AGENT_PASSWORD', 'Demo Agent']
  ]) {
    const email = process.env[emailName]?.toLowerCase().trim();
    const password = process.env[passName];
    if (!email || !password || password.length < 12 || password.includes('replace-this')) {
      throw new Error(`Set ${emailName} and a strong ${passName} (12+ characters) in server/.env`);
    }
    await prisma.user.upsert({
      where: { email }, update: { role: role as Role },
      create: { email, name, passwordHash: await bcrypt.hash(password, 12), role: role as Role, teamId: role === Role.AGENT ? general.id : null }
    });
  }
  console.log('Seeded teams and initial accounts. Never commit server/.env.');
}
seed().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
