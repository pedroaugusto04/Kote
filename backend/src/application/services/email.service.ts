import { Injectable } from '@nestjs/common';

import type { EmailSendPayload } from '../models/email.models.js';
import { EmailProvider } from '../ports/email/email-provider.js';
import { EmailQueuePublisher } from '../ports/email/email-queue.publisher.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../ports/observability/runtime-environment.port.js';
import { AppLogger } from '../../observability/logger.js';

@Injectable()
export class EmailService {
  constructor(
    private readonly emailQueuePublisher: EmailQueuePublisher,
    private readonly emailProvider: EmailProvider,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {}

  async sendEmail(payload: EmailSendPayload): Promise<void> {
    if (!payload.to || !payload.subject) {
      throw new Error('Email payload must include recipient and subject');
    }

    const env = this.environmentProvider.read();
    const interceptedPayload = this.applyEmailIntercept(payload, env);

    try {
      await this.emailQueuePublisher.publishEmailMessage(interceptedPayload);
      this.logger.info('email_service.enqueued', { to: interceptedPayload.to, subject: interceptedPayload.subject });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('email_service.queue_publish_failed', {
        to: interceptedPayload.to,
        subject: interceptedPayload.subject,
        error: message,
      });
      this.logger.info('email_service.fallback_direct_send', { to: interceptedPayload.to, subject: interceptedPayload.subject });
      await this.emailProvider.sendEmail(interceptedPayload);
    }
  }

  private applyEmailIntercept(payload: EmailSendPayload, env: RuntimeEnvironment): EmailSendPayload {
    if (!env.devEmailIntercept || !env.devEmail) {
      return payload;
    }

    const originalTo = payload.to;
    const interceptedPayload = { ...payload, to: env.devEmail };

    this.logger.info('email_service.intercepted', {
      originalTo,
      interceptedTo: env.devEmail,
      subject: payload.subject,
    });

    return interceptedPayload;
  }
}
