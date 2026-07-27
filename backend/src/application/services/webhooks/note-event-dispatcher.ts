import { Injectable } from '@nestjs/common';

import type { NoteEventPayload } from '../../../domain/note-event.js';
import { WebhookQueuePublisher } from '../../ports/webhooks/webhook-queue.publisher.js';
import { AppLogger } from '../../../observability/logger.js';

/**
 * Publishes note lifecycle events to the webhook delivery queue.
 *
 * This is the only dependency that use cases need — they never know
 * about subscriptions, HTTP delivery, or RabbitMQ.
 */
@Injectable()
export class NoteEventDispatcher {
  constructor(
    private readonly webhookQueue: WebhookQueuePublisher,
    private readonly logger: AppLogger,
  ) {}

  async dispatch(payload: NoteEventPayload): Promise<void> {
    try {
      await this.webhookQueue.publish(payload);
    } catch (error) {
      this.logger.error('webhook.dispatch_publish_failed', {
        event: payload.event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
