import { Injectable } from '@nestjs/common';
import { type Channel, type ConsumeMessage } from 'amqplib';
import { DependencyWatcherRepository } from '../../application/ports/dependency-watcher/dependency-watcher.repository.js';
import { DependencyWatcherService } from '../../application/services/dependency-watcher/dependency-watcher.service.js';
import { AppLogger } from '../../observability/logger.js';
import { BaseRabbitMqConsumer } from './base-rabbitmq.consumer.js';
import { type DependencyCheckJobMessage } from './rabbitmq-dependency-check-queue.publisher.js';
import { calculateBackoff, isRateLimitError, RateLimitError, type BackoffOptions } from '../../application/utils/retry/backoff.utils.js';

const QUEUE_NAME = 'kb.dependency_check.jobs';

const BACKOFF_OPTIONS: BackoffOptions = {
  baseDelayMs: 5000, // 5 seconds
  maxDelayMs: 300000, // 5 minutes
  maxRetries: 3,
  multiplier: 2,
  jitterPercent: 20,
};

@Injectable()
export class RabbitMqDependencyCheckQueueConsumer extends BaseRabbitMqConsumer {
  constructor(
    logger: AppLogger,
    private readonly dependencyWatcherRepository: DependencyWatcherRepository,
    private readonly dependencyWatcherService: DependencyWatcherService,
  ) {
    super(logger);
  }

  protected async setupChannel(channel: Channel): Promise<void> {
    await channel.prefetch(5); // Process 5 messages concurrently
    await channel.assertQueue(QUEUE_NAME, { durable: true });
  }

  protected async startConsuming(channel: Channel): Promise<void> {
    await channel.consume(QUEUE_NAME, async (msg) => {
      if (!msg) return;

      try {
        const message: DependencyCheckJobMessage = JSON.parse(msg.content.toString());
        await this.processMessage(message, channel, msg);
      } catch (error) {
        this.logger.error('dependency_check_consumer.parse_error', {
          error: error instanceof Error ? error.message : String(error),
        });
        channel.nack(msg, false, false); // Don't requeue on parse error
      }
    });
  }

  private async processMessage(message: DependencyCheckJobMessage, channel: Channel, msg: ConsumeMessage): Promise<void> {
    const { jobId, userId, projectId, projectSlug, workspaceId, repositoryIds, dependencyIds, retryCount = 0 } = message;

    this.logger.info('dependency_check_consumer.started', {
      jobId,
      projectId,
      dependencyCount: dependencyIds.length,
      retryCount,
    });

    try {
      const dependencies = await this.dependencyWatcherRepository.findByRepositoryIds(
        userId,
        workspaceId,
        repositoryIds,
      );

      const workspaceEnabled = await this.dependencyWatcherRepository.isWorkspaceEnabled(workspaceId);
      if (!workspaceEnabled) {
        this.logger.warn('dependency_check_consumer.workspace_disabled', { jobId, workspaceId });
        channel.ack(msg);
        return;
      }

      let checked = 0;
      let updates = 0;
      let errors = 0;
      const checkedIds: string[] = [];

      for (const dependency of dependencies) {
        if (!dependencyIds.includes(dependency.id)) continue;
        if (!dependency.enabled) continue;

        try {
          checked++;
          const hasUpdate = await this.dependencyWatcherService['checkPackage'](dependency);
          
          if (hasUpdate) {
            updates++;
          }
          checkedIds.push(dependency.id);
        } catch (error) {
          errors++;
          this.logger.error('dependency_check_consumer.check_failed', {
            jobId,
            dependencyId: dependency.id,
            packageName: dependency.packageName,
            error: error instanceof Error ? error.message : String(error),
          });
          // Still update lastCheckedAt even on error
          checkedIds.push(dependency.id);
        }
      }

      // Batch update lastCheckedAt
      if (checkedIds.length > 0) {
        await this.dependencyWatcherRepository.batchUpdateLastCheckedAt(checkedIds);
      }

      this.logger.info('dependency_check_consumer.completed', {
        jobId,
        projectId,
        checked,
        updates,
        errors,
      });

      channel.ack(msg);
    } catch (error) {
      this.logger.error('dependency_check_consumer.processing_error', {
        jobId,
        projectId,
        error: error instanceof Error ? error.message : String(error),
        retryCount,
      });

      // Retry logic with adaptive exponential backoff
      const isRateLimit = isRateLimitError(error);
      const backoff = calculateBackoff(retryCount, BACKOFF_OPTIONS, isRateLimit, isRateLimit ? (error as RateLimitError).retryAfterMs : undefined);

      if (backoff.shouldRetry) {
        this.logger.info('dependency_check_consumer.retry_scheduled', {
          jobId,
          retryCount: backoff.retryCount + 1,
          delayMs: backoff.delayMs,
          isRateLimit,
        });

        // Requeue with delay using message TTL
        setTimeout(() => {
          const retryMessage: DependencyCheckJobMessage = {
            ...message,
            retryCount: backoff.retryCount + 1,
          };
          
          // Re-publish to the queue
          channel.publish(
            '',
            QUEUE_NAME,
            Buffer.from(JSON.stringify(retryMessage)),
            { persistent: true },
          );
        }, backoff.delayMs);

        channel.ack(msg);
      } else {
        this.logger.error('dependency_check_consumer.max_retries_exceeded', {
          jobId,
          projectId,
          retryCount: backoff.retryCount,
        });
        channel.nack(msg, false, false); // Send to DLQ
      }
    }
  }
}
