
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

for (const path of [
  resolve(process.cwd(), 'server/.env'),
  resolve(process.cwd(), '.env'),
]) {
  if (existsSync(path)) {
    process.loadEnvFile(path);
    break;
  }
}

const db = new PrismaClient();

async function main() {
  const email = 'doctorspapers6@gmail.com';

  const user = await db.user.findUnique({
    where: { email },
    select: {
      email: true,
      role: true,
      emailVerifiedAt: true,
      passwordHash: true,
      pendingPasswordHash: true,
    },
  });

  if (!user) {
    console.log('Admin account not found for the new email.');
    return;
  }

  console.log({
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    passwordHashSet: Boolean(user.passwordHash),
    passwordHashFormatValid: Boolean(
      user.passwordHash?.startsWith('scrypt$'),
    ),
    pendingPasswordHashSet: Boolean(user.pendingPasswordHash),
  });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Status check failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
