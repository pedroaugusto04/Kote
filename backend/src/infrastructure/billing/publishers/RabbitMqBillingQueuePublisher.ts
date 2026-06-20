import { Injectable, OnModuleDestroy } from '@nestjs/common';
import amqplib, { type ChannelModel, type Channel } from 'amqplib';

import { BillingQueuePublisher } from '../../../application/ports/billing/billing-queue.publisher.js';
import { AppLogger } from '../../../observability/logger.js';

const DEFAULT_EXCHANGE_NAME = 'billing.webhooks';
const DEFAULT_QUEUE_NAME = 'billing.webhooks.asaas';
const DEFAULT_ROUTING_KEY = 'asaas.webhook';
const RECONNECT_DELAY_MS = 5_000;

@Injectable()
export class RabbitMqBillingQueuePublisher extends BillingQueuePublisher implements OnModuleDestroy {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private connecting = false;
  private closed = false;

  constructor(private readonly logger: AppLogger) {
    super();
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

  async onModuleDestroy() {
    this.closed = true;
    try {
      if (this.channel) await this.channel.close();
    } catch { /* already closed */ }
    try {
      if (this.connection) await this.connection.close();
    } catch { /* already closed */ }
    this.channel = null;
    this.connection = null;
  }

  private getUrl(): string {
    return String(process.env.KB_RABBITMQ_URL || '').trim();
  }

  private async ensureChannel(url: string): Promise<Channel> {
    if (this.channel) return this.channel;
    if (this.connecting) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (this.channel) return this.channel;
      throw new Error('billing_queue.connection_in_progress');
    }

    this.connecting = true;
    try {
      const conn = await amqplib.connect(url);
      this.connection = conn;

      conn.on('error', (error: Error) => {
        this.logger.error('billing_queue.connection_error', { error: error.message });
        this.channel = null;
      });
      conn.on('close', () => {
        this.channel = null;
        if (!this.closed) {
          this.logger.warn('billing_queue.connection_closed_reconnecting');
          setTimeout(() => this.reconnect(url), RECONNECT_DELAY_MS);
        }
      });

      const ch = await conn.createChannel();
      const exchange = process.env.KB_RABBITMQ_BILLING_EXCHANGE || DEFAULT_EXCHANGE_NAME;
      const queue = process.env.KB_RABBITMQ_BILLING_QUEUE || DEFAULT_QUEUE_NAME;
      const routingKey = process.env.KB_RABBITMQ_BILLING_ROUTING_KEY || DEFAULT_ROUTING_KEY;

      const retryExchange = `${exchange}.retry`;
      const retryQueue = `${queue}.retry`;
      const retryRoutingKey = `${routingKey}.retry`;

      // Main flow Setup
      await ch.assertExchange(exchange, 'topic', { durable: true });
      await ch.assertQueue(queue, { durable: true });
      await ch.bindQueue(queue, exchange, routingKey);

      // Retry flow Setup (with dead letter routing back to main exchange)
      await ch.assertExchange(retryExchange, 'topic', { durable: true });
      await ch.assertQueue(retryQueue, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': exchange,
          'x-dead-letter-routing-key': routingKey,
        },
      });
      await ch.bindQueue(retryQueue, retryExchange, retryRoutingKey);

      this.channel = ch;
      this.logger.info('billing_queue.connected');
      return ch;
    } finally {
      this.connecting = false;
    }
  }

  private reconnect(url: string) {
    if (this.closed) return;
    void this.ensureChannel(url).catch((error: unknown) => {
      this.logger.error('billing_queue.reconnect_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}
