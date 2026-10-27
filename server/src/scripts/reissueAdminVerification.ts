
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
  const emailInput = process.argv[2]?.trim().toLowerCase();

  if (!emailInput || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) {
    throw new Error(
      'Usage: npm run --workspace @etm/server start -- <admin-email>',
    );
  }

  if (!process.env.EMAIL_API_KEY || process.env.EMAIL_PROVIDER !== 'resend') {
    throw new Error('Resend email configuration is missing.');
  }

  const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:5173')
    .replace(/\/$/, '');

  const user = await prisma.user.findUnique({
    where: { email: emailInput },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerifiedAt: true,
    },
  });

  if (!user || user.role !== 'ADMIN') {
    throw new Error('No matching admin account found.');
  }

  if (user.emailVerifiedAt) {
    throw new Error(
      'This account is already verified. Use the normal password-recovery process instead.',
    );
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.updateMany({
      where: {
        userId: user.id,
        consumedAt: null,
      },
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

  const verifyUrl =
    `${appBaseUrl}/#/verify-email?token=${encodeURIComponent(token)}`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.EMAIL_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'alerts@etechmatter.com',
        to: [user.email],
        subject: 'Verify your ETechMatter Intelligence admin account',
        text:
          `Hello ${user.name},\n\n` +
          'Use the following link to set your password and verify your account. ' +
          'The link expires in 24 hours:\n\n' +
          `${verifyUrl}\n\n` +
          'If you did not request this, contact your system administrator.',
      }),
    });

if (!response.ok) {
  const details = await response.text();
  console.error('Resend HTTP status:', response.status);
  console.error('Resend error details:', details.slice(0, 1000));
  throw new Error('Resend rejected the email request.');
}

    console.log('Verification email accepted by Resend.');
    console.log('Recipient:', user.email);
    console.log('Expiry:', expiresAt.toISOString());
    console.log('Complete the process using the email link.');
  } catch (error) {
    await prisma.emailVerificationToken.updateMany({
      where: {
        userId: user.id,
        tokenHash,
        consumedAt: null,
      },
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
