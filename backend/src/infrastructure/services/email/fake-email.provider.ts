import { Injectable } from '@nestjs/common';

import type { EmailSendPayload } from '../../../application/models/email.models.js';
import { EmailProvider } from '../../../application/ports/email/email-provider.js';
import { AppLogger } from '../../../observability/logger.js';

@Injectable()
export class FakeEmailProvider extends EmailProvider {
  constructor(private readonly logger: AppLogger) {
    super();
  }

  async sendEmail(payload: EmailSendPayload): Promise<void> {
    this.logger.info('email_provider.fake_email_sent', {
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html ? `${payload.html.slice(0, 256)}...` : undefined,
      templateName: payload.templateName,
    });
  }
}
