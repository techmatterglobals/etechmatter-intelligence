
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { PrismaClient } from '@prisma/client';

const scrypt = promisify(scryptCallback);

for (const path of [
  resolve(process.cwd(), 'server/.env'),
  resolve(process.cwd(), '.env'),
]) {
  if (existsSync(path)) {
    process.loadEnvFile(path);
    break;
  }
}

const prisma = new PrismaClient();

async function main() {
  const email = 'doctorspapers6@gmail.com';
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const password = await rl.question(
      'Enter new admin password (465783687536783657366537): ',
    );

    if (password.length < 12 || password.length > 256) {
      throw new Error('Password must be 12–256 characters long.');
    }

    const confirm = await rl.question('Confirm new password: ');

    if (password !== confirm) {
      throw new Error('Passwords do not match.');
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });

    if (!user || user.role !== 'ADMIN') {
      throw new Error('The specified admin account was not found.');
    }

    const salt = randomBytes(16).toString('hex');
    const key = (await scrypt(password, salt, 64)) as Buffer;
    const passwordHash = `scrypt$${salt}$${key.toString('hex')}`;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          pendingPasswordHash: null,
          emailVerifiedAt: new Date(),
        },
      });

      await tx.emailVerificationToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      await tx.authSession.deleteMany({
        where: { userId: user.id },
      });
    });

    console.log('Admin password updated successfully.');
    console.log('Admin email:', email);
    console.log('Email verification flag set.');
    console.log('Existing sessions invalidated. Log in again.');
  } finally {
    rl.close();
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Password update failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
