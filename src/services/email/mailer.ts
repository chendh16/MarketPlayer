import nodemailer from 'nodemailer';
import { config } from '../../config';
import { logger } from '../../utils/logger';

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;
  if (!config.EMAIL_SMTP_HOST || !config.EMAIL_SMTP_USER) {
    throw new Error('Email SMTP not configured');
  }
  _transporter = nodemailer.createTransport({
    host: config.EMAIL_SMTP_HOST,
    port: config.EMAIL_SMTP_PORT,
    secure: config.EMAIL_SMTP_SECURE,
    auth: { user: config.EMAIL_SMTP_USER, pass: config.EMAIL_SMTP_PASS },
  });
  return _transporter;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(payload: EmailPayload): Promise<{ messageId: string } | null> {
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: config.EMAIL_FROM || config.EMAIL_SMTP_USER,
      ...payload,
    });
    logger.info(`Email sent to ${payload.to}: ${info.messageId}`);
    return { messageId: info.messageId };
  } catch (error) {
    logger.error(`Email send failed to ${payload.to}:`, error);
    return null;
  }
}

export function isEmailConfigured(): boolean {
  return !!(config.EMAIL_SMTP_HOST && config.EMAIL_SMTP_USER);
}
