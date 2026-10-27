import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const envPath = resolve(process.cwd(), 'server/.env');

if (!existsSync(envPath)) {
  throw new Error('server/.env not found. Run from project root.');
}

process.loadEnvFile(envPath);

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing from server/.env');
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { email: 'ali@gmail.com' },
    select: {
      email: true,
      role: true,
      emailVerifiedAt: true,
      passwordHash: true,
    },
  });

  if (!user) {
    console.log('User not found: ali@gmail.com');
  } else {
    console.log({
      email: user.email,
      role: user.role,
      emailVerified: Boolean(user.emailVerifiedAt),
      hasPassword: Boolean(user.passwordHash),
    });
  }
} finally {
  await prisma.$disconnect();
}
