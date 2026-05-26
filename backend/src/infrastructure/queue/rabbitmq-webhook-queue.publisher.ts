import { Injectable, OnModuleDestroy } from '@nestjs/common';
import amqplib, { type ChannelModel, type Channel } from 'amqplib';

import { WebhookQueuePublisher } from '../../application/ports/webhooks/webhook-queue.publisher.js';
import type { NoteEventPayload } from '../../domain/note-event.js';
import { AppLogger } from '../../observability/logger.js';

const EXCHANGE_NAME = 'kb.webhook';
const QUEUE_NAME = 'kb.webhook.delivery';
const ROUTING_KEY = 'webhook.deliver';
const RECONNECT_DELAY_MS = 5_000;

@Injectable()
export class RabbitMqWebhookQueuePublisher extends WebhookQueuePublisher implements OnModuleDestroy {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private connecting = false;
  private closed = false;

  constructor(private readonly logger: AppLogger) {
    super();
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
      throw new Error('webhook_queue.connection_in_progress');
    }

    this.connecting = true;
    try {
      const conn = await amqplib.connect(url);
      this.connection = conn;

      conn.on('error', (error: Error) => {
        this.logger.error('webhook_queue.connection_error', { error: error.message });
        this.channel = null;
      });
      conn.on('close', () => {
        this.channel = null;
        if (!this.closed) {
          this.logger.warn('webhook_queue.connection_closed_reconnecting');
          setTimeout(() => this.reconnect(url), RECONNECT_DELAY_MS);
        }
      });

      const ch = await conn.createChannel();
      await ch.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
      await ch.assertQueue(QUEUE_NAME, {
        durable: true,
        arguments: { 'x-dead-letter-exchange': `${EXCHANGE_NAME}.dlx` },
      });
      await ch.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY);

      // Dead-letter exchange for failed deliveries
      await ch.assertExchange(`${EXCHANGE_NAME}.dlx`, 'direct', { durable: true });
      await ch.assertQueue(`${QUEUE_NAME}.dlq`, { durable: true });
      await ch.bindQueue(`${QUEUE_NAME}.dlq`, `${EXCHANGE_NAME}.dlx`, ROUTING_KEY);

      this.channel = ch;
      this.logger.info('webhook_queue.connected');
      return ch;
    } finally {
      this.connecting = false;
    }
  }

  private reconnect(url: string) {
    if (this.closed) return;
    void this.ensureChannel(url).catch((error: unknown) => {
      this.logger.error('webhook_queue.reconnect_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}
