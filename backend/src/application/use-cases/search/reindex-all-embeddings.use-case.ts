import { Injectable } from '@nestjs/common';

import { EmbeddingQueuePublisher, EmbeddingJobType } from '../../ports/embedding-queue.publisher.js';
import { AppLogger } from '../../../observability/logger.js';

@Injectable()
export class ReindexAllEmbeddingsUseCase {
  constructor(
    private readonly embeddingQueue: EmbeddingQueuePublisher,
    private readonly logger: AppLogger,
  ) {}

  async execute(userId: string): Promise<{ ok: true; message: string }> {
    await this.embeddingQueue.publish({
      type: EmbeddingJobType.ReindexAll,
      userId,
    });

    this.logger.info('reindex_all_embeddings.queued', { userId });

    return {
      ok: true,
      message: 'Reindex job queued. All notes will be re-embedded asynchronously.',
    };
  }
}
