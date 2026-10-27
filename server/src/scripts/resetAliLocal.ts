import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const scrypt = promisify(scryptCallback);
const envPath = resolve(process.cwd(), 'server/.env');

if (!existsSync(envPath)) throw new Error('server/.env not found');
process.loadEnvFile(envPath);

if (process.env.NODE_ENV !== 'development') {
  throw new Error('Blocked: server/.env must explicitly set NODE_ENV=development');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');

const password = process.env.LOCAL_RESET_PASSWORD;
if (!password || password.length < 12 || password.length > 256) {
  throw new Error('Password must be 12–256 characters. Supply it through LOCAL_RESET_PASSWORD.');
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { email: 'ali@gmail.com' },
    select: { id: true, email: true, role: true },
  });

  if (!user) throw new Error('ali@gmail.com was not found');
  if (user.role !== 'VIEWER') throw new Error('Blocked: account role is not VIEWER');

  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  const passwordHash = `scrypt$${salt}$${key.toString('hex')}`;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      pendingPasswordHash: null,
      emailVerifiedAt: new Date(),
    },
  });

  console.log('Local password reset and verification successful.');
  console.log('Email:', user.email);
  console.log('Role:', user.role);
  console.log('Password hash saved; plaintext password was not printed.');
} finally {
  await prisma.$disconnect();
}
