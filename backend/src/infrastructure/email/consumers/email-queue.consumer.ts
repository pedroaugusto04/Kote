import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import amqplib, { type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';

import { AppLogger } from '../../../observability/logger.js';
import { EmailProvider } from '../../../application/ports/email/email-provider.js';
import { RuntimeEnvironmentProvider } from '../../../application/ports/observability/runtime-environment.port.js';
import type { EmailSendPayload } from '../../../application/models/email.models.js';

@Injectable()
export class EmailQueueConsumer implements OnModuleInit, OnModuleDestroy {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private closed = false;

  constructor(
    private readonly logger: AppLogger,
    private readonly emailProvider: EmailProvider,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {}

  async onModuleInit() {
    const environment = this.environmentProvider.read();
    if (!environment.emailWorkerAutorun) {
      this.logger.info('email_queue.consumer_disabled');
      return;
    }

    const url = String(process.env.KB_RABBITMQ_URL || '').trim();
    if (!url) {
      this.logger.warn('email_queue.consumer_missing_rabbitmq_url');
      return;
    }

    await this.initializeConsumer(url, environment); // eslint-disable-line @typescript-eslint/no-misused-promises
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

  private async initializeConsumer(url: string, environment: ReturnType<RuntimeEnvironmentProvider['read']>) {
    const exchange = environment.emailQueueExchange;
    const queue = environment.emailQueueName;
    const routingKey = environment.emailQueueRoutingKey;
    const deadLetterExchange = `${exchange}.dlx`;
    const deadLetterQueue = `${queue}.dlq`;

    const conn = await amqplib.connect(url);
    this.connection = conn;

    conn.on('error', (error: Error) => {
      this.logger.error('email_queue.consumer_connection_error', { error: error.message });
      this.channel = null;
    });
    conn.on('close', () => {
      this.channel = null;
      if (!this.closed) {
        this.logger.warn('email_queue.consumer_connection_closed');
        setTimeout(() => void this.reconnect(url, exchange, queue, routingKey), 5_000);
      }
    });

    const channel = await conn.createChannel();
    await channel.assertExchange(exchange, 'direct', { durable: true });
    await channel.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': deadLetterExchange,
      },
    });
    await channel.assertQueue(deadLetterQueue, { durable: true });
    await channel.assertExchange(deadLetterExchange, 'direct', { durable: true });
    await channel.bindQueue(queue, exchange, routingKey);
    await channel.bindQueue(deadLetterQueue, deadLetterExchange, routingKey);
    await channel.prefetch(1);

    this.channel = channel;
    await channel.consume(queue, (msg) => void this.processMessage(msg));
    this.logger.info('email_queue.consumer_started', {
      exchange,
      queue,
      routingKey,
      deadLetterQueue,
    });
  }

  private async processMessage(msg: ConsumeMessage | null): Promise<void> {
    if (!msg || !this.channel) return;

    let payload: EmailSendPayload | null = null;

    try {
      payload = JSON.parse(msg.content.toString()) as EmailSendPayload;
      if (!payload?.to || !payload?.subject) {
        throw new Error('Invalid email payload');
      }

      await this.emailProvider.sendEmail(payload);
      this.channel.ack(msg);
      this.logger.info('email_queue.processed', { to: payload.to, subject: payload.subject });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('email_queue.processing_failed', {
        error: errorMessage,
        payload,
      });

      this.channel.nack(msg, false, false);
    }
  }

  private async reconnect(url: string, exchange: string, queue: string, routingKey: string) {
    if (this.closed) return;
    try {
      await this.initializeConsumer(url, { ...this.environmentProvider.read() });
    } catch (error) {
      this.logger.error('email_queue.consumer_reconnect_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      setTimeout(() => void this.reconnect(url, exchange, queue, routingKey), 5_000);
    }
  }
}
