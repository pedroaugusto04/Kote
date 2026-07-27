import { Injectable } from '@nestjs/common';
import { type Channel } from 'amqplib';

import { BackfillQueuePublisher } from '../../application/ports/integrations/backfill-queue.publisher.js';
import { AppLogger } from '../../observability/logger.js';
import { BaseRabbitMqPublisher } from './base-rabbitmq.publisher.js';

const EXCHANGE_NAME = 'kb.backfill';
const QUEUE_NAME = 'kb.backfill.jobs';
const ROUTING_KEY = 'backfill.run';
const DLX_NAME = `${EXCHANGE_NAME}.dlx`;
const DLQ_NAME = `${QUEUE_NAME}.dlq`;

export type BackfillJobMessage = {
  jobId: string;
};

@Injectable()
export class RabbitMqBackfillQueuePublisher extends BaseRabbitMqPublisher implements BackfillQueuePublisher {
  constructor(logger: AppLogger) {
    super(logger);
  }

  async publish(message: BackfillJobMessage): Promise<void> {
    const url = this.getUrl();
    if (!url) {
      this.logger.warn('backfill_queue.skipped_no_url', { jobId: message.jobId });
      return;
    }

    try {
      const channel = await this.ensureChannel(url);
      channel.publish(
        EXCHANGE_NAME,
        ROUTING_KEY,
        Buffer.from(JSON.stringify(message)),
        { persistent: true, contentType: 'application/json' },
      );
      this.logger.info('backfill_queue.published', { jobId: message.jobId });
    } catch (error) {
      this.logger.error('backfill_queue.publish_failed', {
        jobId: message.jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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
}
