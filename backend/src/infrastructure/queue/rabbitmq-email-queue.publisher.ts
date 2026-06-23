import { Injectable, OnModuleDestroy } from '@nestjs/common';
import amqplib, { type Channel, type ChannelModel } from 'amqplib';

import { EmailQueuePublisher } from '../../application/ports/email/email-queue.publisher.js';
import type { EmailSendPayload } from '../../application/models/email.models.js';
import { AppLogger } from '../../observability/logger.js';
import { RuntimeEnvironmentProvider } from '../../application/ports/observability/runtime-environment.port.js';

@Injectable()
export class RabbitMqEmailQueuePublisher extends EmailQueuePublisher implements OnModuleDestroy {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private connecting = false;
  private closed = false;

  constructor(
    private readonly logger: AppLogger,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {
    super();
  }

  async publishEmailMessage(payload: EmailSendPayload): Promise<void> {
    const url = String(process.env.KB_RABBITMQ_URL || '').trim();
    if (!url) {
      throw new Error('KB_RABBITMQ_URL is not configured');
    }

    const exchange = this.environmentProvider.read().emailQueueExchange;
    const routingKey = this.environmentProvider.read().emailQueueRoutingKey;

    const channel = await this.ensureChannel(url, exchange);
    const body = Buffer.from(JSON.stringify(payload));

    channel.publish(exchange, routingKey, body, {
      persistent: true,
      contentType: 'application/json',
    });
  }

  async onModuleDestroy() {
    this.closed = true;
    try {
      if (this.channel) await this.channel.close();
    } catch {
      // ignore
    }
    try {
      if (this.connection) await this.connection.close();
    } catch {
      // ignore
    }
    this.channel = null;
    this.connection = null;
  }

  private async ensureChannel(url: string, exchange: string): Promise<Channel> {
    if (this.channel) return this.channel;
    if (this.connecting) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (this.channel) return this.channel;
      throw new Error('email_queue.connection_in_progress');
    }

    this.connecting = true;
    try {
      const conn = await amqplib.connect(url);
      this.connection = conn;

      conn.on('error', (error: Error) => {
        this.logger.error('email_queue.connection_error', { error: error.message });
        this.channel = null;
      });
      conn.on('close', () => {
        this.channel = null;
        if (!this.closed) {
          this.logger.warn('email_queue.connection_closed_reconnecting');
          setTimeout(() => void this.reconnect(url, exchange), 5_000);
        }
      });

      const ch = await conn.createChannel();
      await ch.assertExchange(exchange, 'direct', { durable: true });
      this.channel = ch;
      this.logger.info('email_queue.connected');
      return ch;
    } finally {
      this.connecting = false;
    }
  }

  private reconnect(url: string, exchange: string) {
    if (this.closed) return;
    void this.ensureChannel(url, exchange).catch((error) => {
      this.logger.error('email_queue.reconnect_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }}