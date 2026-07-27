import { Injectable } from '@nestjs/common';
import { type Channel } from 'amqplib';
import { randomUUID } from 'crypto';

import {
  EmbeddingQueuePublisher,
  type EmbeddingJobPayload,
  EmbeddingJobType,
} from '../../application/ports/notes/embedding-queue.publisher.js';
import { EmbeddingPriority } from '../../domain/enums/knowledge.enums.js';
import { AppLogger } from '../../observability/logger.js';
import { BaseRabbitMqPublisher } from './base-rabbitmq.publisher.js';

const EXCHANGE_NAME = 'kb.embedding';
const HIGH_PRIORITY_QUEUE = 'kb.embedding.high';
const LOW_PRIORITY_QUEUE = 'kb.embedding.low';
const HIGH_PRIORITY_ROUTING_KEY = 'embedding.high';
const LOW_PRIORITY_ROUTING_KEY = 'embedding.low';

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
      const routingKey = job.priority === EmbeddingPriority.High ? HIGH_PRIORITY_ROUTING_KEY : LOW_PRIORITY_ROUTING_KEY;
      const priority = job.priority === EmbeddingPriority.High ? 10 : 5;

      channel.publish(
        EXCHANGE_NAME,
        routingKey,
        Buffer.from(JSON.stringify(job)),
        { persistent: true, contentType: 'application/json', priority },
      );
    } catch (error) {
      this.logger.error('embedding_queue.publish_failed', {
        jobType: job.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async publishQueryEmbedding(config: { userId: string; queryText: string }): Promise<number[][]> {
    const url = this.getUrl();
    if (!url) {
      this.logger.warn('embedding_queue.query_skipped_no_url');
      throw new Error('RabbitMQ URL not configured');
    }

    const correlationId = randomUUID();
    const replyQueue = `kb.embedding.reply.${correlationId}`;

    try {
      const channel = await this.ensureChannel(url);

      // Setup temporary reply queue
      await channel.assertQueue(replyQueue, { exclusive: true, autoDelete: true });

      const promise = new Promise<number[][]>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('RPC timeout after 5000ms'));
        }, 5000);

        channel.consume(replyQueue, (msg: any) => {
          if (!msg) return;
          clearTimeout(timeout);
          const response = JSON.parse(msg.content.toString());
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.embeddings);
          }
        }, { noAck: true });
      });

      // Publish request
      channel.publish(
        EXCHANGE_NAME,
        HIGH_PRIORITY_ROUTING_KEY,
        Buffer.from(JSON.stringify({
          type: EmbeddingJobType.QueryEmbedding,
          userId: config.userId,
          queryText: config.queryText,
          priority: EmbeddingPriority.High,
          correlationId,
          replyTo: replyQueue,
        })),
        { priority: 10, correlationId, replyTo: replyQueue }
      );

      return promise;
    } catch (error) {
      this.logger.error('embedding_queue.query_publish_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  protected async setupChannel(channel: Channel): Promise<void> {
    await channel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });

    // High priority queue
    await channel.assertQueue(HIGH_PRIORITY_QUEUE, {
      durable: true,
      arguments: { 'x-max-priority': 10, 'x-dead-letter-exchange': `${EXCHANGE_NAME}.dlx` },
    });
    await channel.bindQueue(HIGH_PRIORITY_QUEUE, EXCHANGE_NAME, HIGH_PRIORITY_ROUTING_KEY);

    // Low priority queue
    await channel.assertQueue(LOW_PRIORITY_QUEUE, {
      durable: true,
      arguments: { 'x-max-priority': 5, 'x-dead-letter-exchange': `${EXCHANGE_NAME}.dlx` },
    });
    await channel.bindQueue(LOW_PRIORITY_QUEUE, EXCHANGE_NAME, LOW_PRIORITY_ROUTING_KEY);

    // Dead-letter exchange for failed messages
    await channel.assertExchange(`${EXCHANGE_NAME}.dlx`, 'direct', { durable: true });
    await channel.assertQueue(`${HIGH_PRIORITY_QUEUE}.dlq`, { durable: true });
    await channel.bindQueue(`${HIGH_PRIORITY_QUEUE}.dlq`, `${EXCHANGE_NAME}.dlx`, HIGH_PRIORITY_ROUTING_KEY);
    await channel.assertQueue(`${LOW_PRIORITY_QUEUE}.dlq`, { durable: true });
    await channel.bindQueue(`${LOW_PRIORITY_QUEUE}.dlq`, `${EXCHANGE_NAME}.dlx`, LOW_PRIORITY_ROUTING_KEY);
  }
}
