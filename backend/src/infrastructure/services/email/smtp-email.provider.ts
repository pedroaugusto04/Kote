import nodemailer from 'nodemailer';
import { Injectable } from '@nestjs/common';

import type { EmailSendPayload } from '../../../application/models/email.models.js';
import { EmailProvider } from '../../../application/ports/email/email-provider.js';
import { RuntimeEnvironmentProvider } from '../../../application/ports/observability/runtime-environment.port.js';
import { AppLogger } from '../../../observability/logger.js';

@Injectable()
export class SmtpEmailProvider extends EmailProvider {
  private transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

  constructor(
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  private getTransporter() {
    if (this.transporter) return this.transporter;

    const env = this.environmentProvider.read();
    const host = env.emailSmtpHost;
    const port = env.emailSmtpPort;
    const user = env.emailSmtpUser;
    const pass = env.emailSmtpPass;

    if (!host || !port) {
      this.logger.error('email_provider.smtp_missing_configuration');
      throw new Error('SMTP configuration is missing. Check KB_EMAIL_SMTP_HOST and KB_EMAIL_SMTP_PORT.');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: env.emailSmtpSecure,
      auth: user && pass ? { user, pass } : undefined,
    });

    return this.transporter;
  }

  async sendEmail(payload: EmailSendPayload): Promise<void> {
    const env = this.environmentProvider.read();
    const from = env.emailFrom;

    if (!payload.text && !payload.html) {
      this.logger.warn('email_provider.smtp_missing_body', {
        to: payload.to,
        subject: payload.subject,
      });
    }

    const transporter = this.getTransporter();
    await transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });

    this.logger.info('email_provider.smtp_sent', { to: payload.to, subject: payload.subject });
  }
}
