import { Injectable } from '@nestjs/common';
import { type Channel, type Message } from 'amqplib';

import { GithubBackfillRunnerService } from '../../application/services/integrations/github-backfill-runner.service.js';
import { GithubBackfillJobRepository } from '../../application/ports/integrations/github-backfill-job.repository.js';
import { AppLogger } from '../../observability/logger.js';
import { BaseRabbitMqConsumer } from './base-rabbitmq.consumer.js';

const EXCHANGE_NAME = 'kb.backfill';
const QUEUE_NAME = 'kb.backfill.jobs';
const ROUTING_KEY = 'backfill.run';
const DLX_NAME = `${EXCHANGE_NAME}.dlx`;
const DLQ_NAME = `${QUEUE_NAME}.dlq`;

@Injectable()
export class RabbitMqBackfillQueueConsumer extends BaseRabbitMqConsumer {
  constructor(
    private readonly runnerService: GithubBackfillRunnerService,
    private readonly jobRepository: GithubBackfillJobRepository,
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
    // prefetch(1) ensures one backfill runs at a time per consumer instance,
    // preventing DB/GitHub API overload from concurrent large backfills.
    await channel.prefetch(1);
    await channel.consume(QUEUE_NAME, (msg) => this.processMessage(msg, channel));
  }

  private async processMessage(msg: Message | null, channel: Channel): Promise<void> {
    if (!msg) return;

    let jobId: string | null = null;

    try {
      const content = JSON.parse(msg.content.toString()) as { jobId?: string };
      jobId = content?.jobId ?? null;

      if (!jobId) {
        this.logger.error('backfill_consumer.invalid_message_no_job_id', {});
        channel.ack(msg);
        return;
      }

      this.logger.info('backfill_consumer.processing', { jobId });

      // Resolve userId from DB using unchecked lookup (consumer only has jobId).
      const job = await this.jobRepository.findByIdUnchecked(jobId);
      if (!job) {
        this.logger.warn('backfill_consumer.job_not_found_acking', { jobId });
        channel.ack(msg);
        return;
      }

      await this.runnerService.run(jobId, job.userId);

      this.logger.info('backfill_consumer.completed', { jobId });
      channel.ack(msg);
    } catch (error) {
      this.logger.error('backfill_consumer.processing_failed', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Ack even on failure: the runner already persisted 'failed' status to the DB.
      // Re-queueing would re-run the whole backfill, which is safe (idempotent via
      // noteExistsForPush) but unnecessary — user can re-trigger from the UI.
      channel.ack(msg);
    }
  }
}
