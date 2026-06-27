import { Injectable } from '@nestjs/common';
import { type Channel } from 'amqplib';

import {
  EmbeddingQueuePublisher,
  type EmbeddingJobPayload,
} from '../../application/ports/notes/embedding-queue.publisher.js';
import { AppLogger } from '../../observability/logger.js';
import { BaseRabbitMqPublisher } from './base-rabbitmq.publisher.js';

const EXCHANGE_NAME = 'kb.embedding';
const QUEUE_NAME = 'kb.embedding.jobs';
const ROUTING_KEY = 'embedding.job';

@Injectable()
export class RabbitMqEmbeddingQueuePublisher extends BaseRabbitMqPublisher implements EmbeddingQueuePublisher {
  constructor(logger: AppLogger) {
    super(logger);
  }

  async publish(job: EmbeddingJobPayload): Promise<void> {
    const url = this.getUrl();
    if (!url) {
      this.logger.warn('embedding_queue.skipped_no_url', { jobType: job.type });
      return;
    }

    try {
      const channel = await this.ensureChannel(url);
      channel.publish(
        EXCHANGE_NAME,
        ROUTING_KEY,
        Buffer.from(JSON.stringify(job)),
        { persistent: true, contentType: 'application/json' },
      );
    } catch (error) {
      this.logger.error('embedding_queue.publish_failed', {
        jobType: job.type,
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

    // Dead-letter exchange for failed messages
    await channel.assertExchange(`${EXCHANGE_NAME}.dlx`, 'direct', { durable: true });
    await channel.assertQueue(`${QUEUE_NAME}.dlq`, { durable: true });
    await channel.bindQueue(`${QUEUE_NAME}.dlq`, `${EXCHANGE_NAME}.dlx`, ROUTING_KEY);
  }
}
