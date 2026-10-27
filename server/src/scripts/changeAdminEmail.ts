
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

for (const path of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), 'server/.env'),
]) {
  if (existsSync(path)) {
    process.loadEnvFile(path);
    break;
  }
}

const prisma = new PrismaClient();

async function main() {
  const oldEmail = 'sain@techmatter.co';
  const newEmail = 'doctorspapers6@gmail.com';

  const existing = await prisma.user.findUnique({
    where: { email: newEmail },
    select: { id: true },
  });

  if (existing) {
    throw new Error('The new email is already assigned to an account.');
  }

  const admin = await prisma.user.findUnique({
    where: { email: oldEmail },
    select: { id: true, role: true },
  });

  if (!admin || admin.role !== 'ADMIN') {
    throw new Error('The existing admin account was not found.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.updateMany({
      where: { userId: admin.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await tx.user.update({
      where: { id: admin.id },
      data: {
        email: newEmail,
        emailVerifiedAt: null,
      },
    });
  });

  console.log('Admin email updated successfully.');
  console.log('New email:', newEmail);
  console.log('Email verification is required before login.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Email update failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
