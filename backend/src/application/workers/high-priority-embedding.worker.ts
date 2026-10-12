import { Injectable } from '@nestjs/common';
import type { Channel } from 'amqplib';

import { EmbeddingJobType, type EmbeddingJobPayload } from '../ports/notes/embedding-queue.publisher.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { EmbeddingJobProcessorService } from '../services/notes/embedding-job-processor.service.js';
import { AppLogger } from '../../observability/logger.js';
import { BaseEmbeddingWorker } from './base-embedding.worker.js';

@Injectable()
export class HighPriorityEmbeddingWorker extends BaseEmbeddingWorker {
  protected readonly queueName = 'kb.embedding.high';
  protected readonly routingKey = 'embedding.high';
  protected readonly prefetchCount = 2;
  protected readonly maxPriority = 10;
  protected readonly workerName = 'high_priority_embedding_worker';

  constructor(
    processor: EmbeddingJobProcessorService,
    runtimeEnv: RuntimeEnvironmentProvider,
    logger: AppLogger,
  ) {
    super(processor, runtimeEnv, logger);
  }

  protected async processJob(ch: Channel, job: EmbeddingJobPayload): Promise<void> {
    switch (job.type) {
      case EmbeddingJobType.QueryEmbedding:
        await this.processor.processQueryEmbedding(ch, job as EmbeddingJobPayload & { type: EmbeddingJobType.QueryEmbedding; queryText: string; replyTo?: string; correlationId?: string });
        break;
      default:
        this.logger.warn(`${this.workerName}.unexpected_job_type`, { job });
    }
  }
}
