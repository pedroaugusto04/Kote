import { Injectable } from '@nestjs/common';
import { type Channel } from 'amqplib';

import { BillingQueuePublisher } from '../../../application/ports/billing/billing-queue.publisher.js';
import { AppLogger } from '../../../observability/logger.js';
import { BaseRabbitMqPublisher } from '../../queue/base-rabbitmq.publisher.js';

const DEFAULT_EXCHANGE_NAME = 'billing.webhooks';
const DEFAULT_QUEUE_NAME = 'billing.webhooks.asaas';
const DEFAULT_ROUTING_KEY = 'asaas.webhook';

@Injectable()
export class RabbitMqBillingQueuePublisher extends BaseRabbitMqPublisher implements BillingQueuePublisher {
  constructor(logger: AppLogger) {
    super(logger);
  }

  async publishWebhookEventId(webhookEventId: string): Promise<void> {
    const url = this.getUrl();
    if (!url) {
      this.logger.warn('billing_queue.skipped_no_url', { webhookEventId });
      return;
    }

    try {
      const channel = await this.ensureChannel(url);
      const exchange = process.env.KB_RABBITMQ_BILLING_EXCHANGE || DEFAULT_EXCHANGE_NAME;
      const routingKey = process.env.KB_RABBITMQ_BILLING_ROUTING_KEY || DEFAULT_ROUTING_KEY;

      channel.publish(
        exchange,
        routingKey,
        Buffer.from(JSON.stringify({ webhookEventId })),
        { persistent: true, contentType: 'application/json' },
      );
      this.logger.info('billing_queue.published', { webhookEventId });
    } catch (error) {
      this.logger.error('billing_queue.publish_failed', {
        webhookEventId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  protected async setupChannel(channel: Channel): Promise<void> {
    const exchange = process.env.KB_RABBITMQ_BILLING_EXCHANGE || DEFAULT_EXCHANGE_NAME;
    const queue = process.env.KB_RABBITMQ_BILLING_QUEUE || DEFAULT_QUEUE_NAME;
    const routingKey = process.env.KB_RABBITMQ_BILLING_ROUTING_KEY || DEFAULT_ROUTING_KEY;

    const retryExchange = `${exchange}.retry`;
    const retryQueue = `${queue}.retry`;
    const retryRoutingKey = `${routingKey}.retry`;

    // Main flow Setup
    await channel.assertExchange(exchange, 'topic', { durable: true });
    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, exchange, routingKey);

    // Retry flow Setup (with dead letter routing back to main exchange)
    await channel.assertExchange(retryExchange, 'topic', { durable: true });
    await channel.assertQueue(retryQueue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': exchange,
        'x-dead-letter-routing-key': routingKey,
      },
    });
    await channel.bindQueue(retryQueue, retryExchange, retryRoutingKey);
  }
}
