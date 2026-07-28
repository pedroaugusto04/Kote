import { Injectable } from '@nestjs/common';
import { type Channel } from 'amqplib';
import { AppLogger } from '../../observability/logger.js';
import { BaseRabbitMqPublisher } from './base-rabbitmq.publisher.js';

const EXCHANGE_NAME = 'kb.dependency_check';
const QUEUE_NAME = 'kb.dependency_check.jobs';
const ROUTING_KEY = 'dependency_check.run';
const DLX_NAME = `${EXCHANGE_NAME}.dlx`;
const DLQ_NAME = `${QUEUE_NAME}.dlq`;

export type DependencyCheckJobMessage = {
  jobId: string;
  userId: string;
  projectId: string;
  projectSlug: string;
  workspaceId: string;
  repositoryIds: string[];
  dependencyIds: string[];
  retryCount?: number;
};

@Injectable()
export class RabbitMqDependencyCheckQueuePublisher extends BaseRabbitMqPublisher {
  constructor(logger: AppLogger) {
    super(logger);
  }

  async publish(message: DependencyCheckJobMessage): Promise<void> {
    const url = this.getUrl();
    if (!url) {
      this.logger.warn('dependency_check_queue.skipped_no_url', { jobId: message.jobId });
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
          expiration: '3600000', // 1 hour TTL
        },
      );
      this.logger.info('dependency_check_queue.published', { 
        jobId: message.jobId,
        projectId: message.projectId,
        dependencyCount: message.dependencyIds.length,
      });
    } catch (error) {
      this.logger.error('dependency_check_queue.publish_failed', {
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
        'x-message-ttl': 3600000, // 1 hour TTL
      },
    });
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY);

    await channel.assertQueue(DLQ_NAME, { durable: true });
    await channel.bindQueue(DLQ_NAME, DLX_NAME, ROUTING_KEY);
  }
}
