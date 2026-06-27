import { Injectable } from '@nestjs/common';
import { type Channel } from 'amqplib';

import { WebhookQueuePublisher } from '../../application/ports/webhooks/webhook-queue.publisher.js';
import type { NoteEventPayload } from '../../domain/note-event.js';
import { AppLogger } from '../../observability/logger.js';
import { BaseRabbitMqPublisher } from './base-rabbitmq.publisher.js';

const EXCHANGE_NAME = 'kb.webhook';
const QUEUE_NAME = 'kb.webhook.delivery';
const ROUTING_KEY = 'webhook.deliver';

@Injectable()
export class RabbitMqWebhookQueuePublisher extends BaseRabbitMqPublisher implements WebhookQueuePublisher {
  constructor(logger: AppLogger) {
    super(logger);
  }

  async publish(payload: NoteEventPayload): Promise<void> {
    const url = this.getUrl();
    if (!url) {
      this.logger.warn('webhook_queue.skipped_no_url', { event: payload.event });
      return;
    }

    try {
      const channel = await this.ensureChannel(url);
      channel.publish(
        EXCHANGE_NAME,
        ROUTING_KEY,
        Buffer.from(JSON.stringify(payload)),
        { persistent: true, contentType: 'application/json' },
      );
    } catch (error) {
      this.logger.error('webhook_queue.publish_failed', {
        event: payload.event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  protected async setupChannel(channel: Channel): Promise<void> {
    await channel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': `${EXCHANGE_NAME}.dlx` },
    });
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY);

    // Dead-letter exchange for failed deliveries
    await channel.assertExchange(`${EXCHANGE_NAME}.dlx`, 'direct', { durable: true });
    await channel.assertQueue(`${QUEUE_NAME}.dlq`, { durable: true });
    await channel.bindQueue(`${QUEUE_NAME}.dlq`, `${EXCHANGE_NAME}.dlx`, ROUTING_KEY);
  }
}
