import { Injectable } from '@nestjs/common';
import type { Channel } from 'amqplib';

import { EmbeddingJobType, type EmbeddingJobPayload } from '../ports/notes/embedding-queue.publisher.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { EmbeddingJobProcessorService } from '../services/notes/embedding-job-processor.service.js';
import { AppLogger } from '../../observability/logger.js';
import { BaseEmbeddingWorker } from './base-embedding.worker.js';

@Injectable()
export class LowPriorityEmbeddingWorker extends BaseEmbeddingWorker {
  protected readonly queueName = 'kb.embedding.low';
  protected readonly routingKey = 'embedding.low';
  protected readonly prefetchCount = 4;
  protected readonly maxPriority = 5;
  protected readonly workerName = 'low_priority_embedding_worker';

  constructor(
    processor: EmbeddingJobProcessorService,
    runtimeEnv: RuntimeEnvironmentProvider,
    logger: AppLogger,
  ) {
    super(processor, runtimeEnv, logger);
  }

  protected async processJob(_ch: Channel, job: EmbeddingJobPayload): Promise<void> {
    switch (job.type) {
      case EmbeddingJobType.Index:
        await this.processor.processIndex(job.userId, job.noteId);
        break;
      case EmbeddingJobType.Delete:
        await this.processor.processDelete(job.userId, job.noteId);
        break;
      case EmbeddingJobType.ReindexAll:
        await this.processor.processReindexAll(job.userId);
        break;
      default:
        this.logger.warn(`${this.workerName}.unexpected_job_type`, { job });
    }
  }
}
