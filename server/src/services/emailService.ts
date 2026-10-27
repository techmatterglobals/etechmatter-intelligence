
import nodemailer from 'nodemailer';
import { env } from '../config/env';

const smtp = {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || '',
};

export const emailService = {
  async send(to: string, subject: string, text: string) {
    if (
      !smtp.host ||
      !smtp.from ||
      !smtp.user ||
      !smtp.pass
    ) {
      throw new Error(
        'SMTP is not configured. Check SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM.',
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });

    await transporter.sendMail({
      from: smtp.from,
      to,
      subject,
      text,
    });
  },
};
