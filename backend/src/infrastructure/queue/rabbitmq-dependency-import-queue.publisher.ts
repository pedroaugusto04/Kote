import { Injectable } from '@nestjs/common';
import { type Channel } from 'amqplib';
import { AppLogger } from '../../observability/logger.js';
import { BaseRabbitMqPublisher } from './base-rabbitmq.publisher.js';

const EXCHANGE_NAME = 'kb.dependency_import';
const QUEUE_NAME = 'kb.dependency_import.jobs';
const ROUTING_KEY = 'dependency_import.run';
const DLX_NAME = `${EXCHANGE_NAME}.dlx`;
const DLQ_NAME = `${QUEUE_NAME}.dlq`;

export type DependencyImportJobMessage = {
  jobId: string;
  userId: string;
  workspaceSlug: string;
  workspaceId: string;
  projectIds?: string[];
  repositoryIds?: string[];
  retryCount?: number;
};

@Injectable()
export class RabbitMqDependencyImportQueuePublisher extends BaseRabbitMqPublisher {
  constructor(logger: AppLogger) {
    super(logger);
  }

  async publish(message: DependencyImportJobMessage): Promise<void> {
    const url = this.getUrl();
    if (!url) {
      this.logger.warn('dependency_import_queue.skipped_no_url', { jobId: message.jobId });
      return;
    }

    try {
      const channel = await this.ensureChannel(url);
      channel.publish(
        EXCHANGE_NAME,
        ROUTING_KEY,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          contentType: 'application/json',
          expiration: '7200000', // 2 hours TTL for import (longer operation)
        },
      );
      this.logger.info('dependency_import_queue.published', { 
        jobId: message.jobId,
        workspaceSlug: message.workspaceSlug,
        projectIds: message.projectIds,
        repositoryIds: message.repositoryIds,
      });
    } catch (error) {
      this.logger.error('dependency_import_queue.publish_failed', {
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
      arguments: {
        'x-dead-letter-exchange': DLX_NAME,
      },
    });
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY);

    await channel.assertQueue(DLQ_NAME, { durable: true });
    await channel.bindQueue(DLQ_NAME, DLX_NAME, ROUTING_KEY);
  }
}
