import { Resend } from 'resend';
import { Injectable } from '@nestjs/common';

import type { EmailSendPayload } from '../../../application/models/email.models.js';
import { EmailProvider } from '../../../application/ports/email/email-provider.js';
import { RuntimeEnvironmentProvider } from '../../../application/ports/observability/runtime-environment.port.js';
import { AppLogger } from '../../../observability/logger.js';

@Injectable()
export class ResendEmailProvider extends EmailProvider {
  private client: Resend | null = null;

  constructor(
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  private getClient(): Resend {
    if (this.client) return this.client;

    const env = this.environmentProvider.read();
    const apiKey = env.emailResendApiKey;
    if (!apiKey) {
      this.logger.error('email_provider.resend_missing_api_key');
      throw new Error('KB_EMAIL_RESEND_API_KEY is not configured');
    }

    this.client = new Resend(apiKey);
    return this.client;
  }

  async sendEmail(payload: EmailSendPayload): Promise<void> {
    const env = this.environmentProvider.read();
    const from = env.emailFrom;

    if (!payload.text && !payload.html) {
      this.logger.warn('email_provider.resend_missing_body', {
        to: payload.to,
        subject: payload.subject,
      });
    }

    await this.getClient().emails.send({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html ?? undefined,
      text: payload.text ?? undefined,
      headers: {
        'X-KB-Service': 'Knowledge Base',
      },
    } as any);

    this.logger.info('email_provider.resend_sent', { to: payload.to, subject: payload.subject });
  }
}
