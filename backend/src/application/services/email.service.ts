import { Injectable } from '@nestjs/common';

import type { EmailSendPayload } from '../models/email.models.js';
import { EmailProvider } from '../ports/email/email-provider.js';
import { EmailQueuePublisher } from '../ports/email/email-queue.publisher.js';
import { AppLogger } from '../../observability/logger.js';

@Injectable()
export class EmailService {
  constructor(
    private readonly emailQueuePublisher: EmailQueuePublisher,
    private readonly emailProvider: EmailProvider,
    private readonly logger: AppLogger,
  ) {}

  async sendEmail(payload: EmailSendPayload): Promise<void> {
    if (!payload.to || !payload.subject) {
      throw new Error('Email payload must include recipient and subject');
    }

    try {
      await this.emailQueuePublisher.publishEmailMessage(payload);
      this.logger.info('email_service.enqueued', { to: payload.to, subject: payload.subject });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('email_service.queue_publish_failed', {
        to: payload.to,
        subject: payload.subject,
        error: message,
      });
      this.logger.info('email_service.fallback_direct_send', { to: payload.to, subject: payload.subject });
      await this.emailProvider.sendEmail(payload);
    }
  }
}
