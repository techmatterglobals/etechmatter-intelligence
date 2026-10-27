import { createHash, randomBytes } from 'node:crypto';
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

const prisma = new PrismaClient();

async function main() {
  const email = 'sain@techmatter.co';

  if (
    process.env.EMAIL_PROVIDER !== 'resend' ||
    !process.env.EMAIL_API_KEY ||
    !process.env.EMAIL_FROM
  ) {
    throw new Error('Resend configuration is missing.');
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerifiedAt: true,
    },
  });

  if (!user || user.role !== 'SALES') {
    throw new Error('Expected SALES account was not found.');
  }

  if (user.emailVerifiedAt) {
    throw new Error('Account is already verified; do not issue a verification link.');
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await tx.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });
  });

  try {
    const baseUrl = (process.env.APP_BASE_URL || 'http://localhost:5173')
      .replace(/\/$/, '');
    const verifyUrl =
      `${baseUrl}/#/verify-email?token=${encodeURIComponent(token)}`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.EMAIL_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [user.email],
        subject: 'Verify your ETechMatter Intelligence account',
        text:
          `Hello ${user.name},\n\n` +
          'Open this link to verify your account and set your password. ' +
          'The link expires in 24 hours:\n\n' +
          `${verifyUrl}\n`,
      }),
    });

    if (!response.ok) {
      console.error('Resend HTTP status:', response.status);
      console.error('Resend error:', (await response.text()).slice(0, 500));
      throw new Error('Resend rejected the email.');
    }

    console.log('Resend accepted the verification email.');
    console.log('Recipient:', user.email);
    console.log('Expiry:', expiresAt.toISOString());
    console.log('Check the inbox and spam folder.');
  } catch (error) {
    await prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, tokenHash, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Recovery failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
