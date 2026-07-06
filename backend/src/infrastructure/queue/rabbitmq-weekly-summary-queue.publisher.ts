import { Injectable } from '@nestjs/common';
import { type Channel } from 'amqplib';

import { WeeklySummaryQueuePublisher, type WeeklySummaryJobMessage } from '../../application/ports/weekly-summary/weekly-summary-queue.publisher.js';
import { AppLogger } from '../../observability/logger.js';
import { BaseRabbitMqPublisher } from './base-rabbitmq.publisher.js';

const EXCHANGE_NAME = 'kb.weekly-summary';
const QUEUE_NAME = 'kb.weekly-summary.jobs';
const ROUTING_KEY = 'weekly-summary.process';
const DLX_NAME = `${EXCHANGE_NAME}.dlx`;
const DLQ_NAME = `${QUEUE_NAME}.dlq`;

@Injectable()
export class RabbitMqWeeklySummaryQueuePublisher extends BaseRabbitMqPublisher implements WeeklySummaryQueuePublisher {
  constructor(logger: AppLogger) {
    super(logger);
  }

  async publishWeeklySummaryJob(message: WeeklySummaryJobMessage): Promise<void> {
    const url = this.getUrl();
    if (!url) {
      throw new Error('KB_RABBITMQ_URL is not configured');
    }

    const channel = await this.ensureChannel(url);
    channel.publish(
      EXCHANGE_NAME,
      ROUTING_KEY,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        contentType: 'application/json',
      },
    );

    this.logger.info('weekly_summary_queue.published', {
      userId: message.userId,
      startIso: message.startIso,
      endIso: message.endIso,
    });
  }

  protected async setupChannel(channel: Channel): Promise<void> {
    await channel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
    await channel.assertExchange(DLX_NAME, 'direct', { durable: true });

    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': DLX_NAME,
      },
    });
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY);

    await channel.assertQueue(DLQ_NAME, { durable: true });
    await channel.bindQueue(DLQ_NAME, DLX_NAME, ROUTING_KEY);
  }
}
