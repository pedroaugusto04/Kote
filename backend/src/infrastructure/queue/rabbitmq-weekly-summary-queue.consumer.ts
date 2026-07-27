import { Injectable } from '@nestjs/common';
import { type Channel, type Message } from 'amqplib';

import { WeeklySummaryService } from '../../application/services/content/weekly-summary.service.js';
import { AppLogger } from '../../observability/logger.js';
import { BaseRabbitMqConsumer } from './base-rabbitmq.consumer.js';
import { type WeeklySummaryJobMessage } from '../../application/ports/weekly-summary/weekly-summary-queue.publisher.js';

const EXCHANGE_NAME = 'kb.weekly-summary';
const QUEUE_NAME = 'kb.weekly-summary.jobs';
const ROUTING_KEY = 'weekly-summary.process';
const DLX_NAME = `${EXCHANGE_NAME}.dlx`;
const DLQ_NAME = `${QUEUE_NAME}.dlq`;
const MAX_RETRIES = 3;

@Injectable()
export class RabbitMqWeeklySummaryQueueConsumer extends BaseRabbitMqConsumer {
  constructor(
    private readonly weeklySummaryService: WeeklySummaryService,
    logger: AppLogger,
  ) {
    super(logger);
  }

  protected async setupChannel(channel: Channel): Promise<void> {
    await channel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
    await channel.assertExchange(DLX_NAME, 'direct', { durable: true });

    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': DLX_NAME },
    });
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY);

    await channel.assertQueue(DLQ_NAME, { durable: true });
    await channel.bindQueue(DLQ_NAME, DLX_NAME, ROUTING_KEY);
  }

  protected async startConsuming(channel: Channel): Promise<void> {
    await channel.prefetch(1);
    await channel.consume(QUEUE_NAME, (msg) => void this.processMessage(msg, channel));
  }

  private async processMessage(msg: Message | null, channel: Channel): Promise<void> {
    if (!msg) return;

    let message: WeeklySummaryJobMessage | null = null;
    let retryCount = 0;

    try {
      message = JSON.parse(msg.content.toString()) as WeeklySummaryJobMessage;
      retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;

      if (!message?.userId || !message?.startIso || !message?.endIso) {
        this.logger.error('weekly_summary_consumer.invalid_message', { content: msg.content.toString() });
        channel.ack(msg);
        return;
      }

      this.logger.info('weekly_summary_consumer.processing', {
        userId: message.userId,
        startIso: message.startIso,
        endIso: message.endIso,
        retryCount,
      });

      await this.weeklySummaryService.sendWeeklySummaryToUserForRange(
        message.userId,
        message.startIso,
        message.endIso,
      );

      this.logger.info('weekly_summary_consumer.completed', { userId: message.userId });
      channel.ack(msg);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('weekly_summary_consumer.processing_failed', {
        error: errorMessage,
        userId: message?.userId,
        retryCount,
      });

      if (!message) {
        channel.ack(msg);
        return;
      }

      const isPermanentError = typeof errorMessage === 'string' && errorMessage.includes('not found or has no email');
      if (isPermanentError) {
        channel.ack(msg);
        return;
      }

      if (retryCount >= MAX_RETRIES) {
        this.logger.warn('weekly_summary_consumer.dead_lettering', {
          userId: message.userId,
          retryCount,
        });
        channel.nack(msg, false, false);
        return;
      }

      channel.ack(msg);
      channel.publish(
        EXCHANGE_NAME,
        ROUTING_KEY,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          contentType: 'application/json',
          headers: { 'x-retry-count': retryCount + 1 },
        },
      );
      this.logger.info('weekly_summary_consumer.retry_scheduled', {
        userId: message.userId,
        retryCount: retryCount + 1,
      });
    }
  }
}
