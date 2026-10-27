import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const envPath = resolve(process.cwd(), 'server/.env');

if (!existsSync(envPath)) {
  throw new Error('Run this script from the project root; server/.env was not found.');
}

process.loadEnvFile(envPath);

if (process.env.NODE_ENV !== 'development') {
  throw new Error('Blocked: NODE_ENV must be explicitly set to development in server/.env.');
}

const prisma = new PrismaClient();

async function main() {
  const email = 'sain@techmatter.co';

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      emailVerifiedAt: true,
    },
  });

  if (!user) {
    throw new Error('Target account was not found.');
  }

  if (user.role !== 'SALES') {
    throw new Error('Blocked: target account is not a SALES account.');
  }

  if (user.emailVerifiedAt) {
    console.log('Account is already verified.');
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });

  console.log('Local development verification completed.');
  console.log('Email:', user.email);
  console.log('Role:', user.role);
  console.log('Password was not changed.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Verification failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
