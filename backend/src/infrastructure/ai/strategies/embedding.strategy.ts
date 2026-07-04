import type { EmbeddingConfig } from '../../../application/ports/notes/embedding.gateway.js';
import { EmbeddingTaskType } from '../../../contracts/enums.js';

export interface EmbeddingStrategy {
  generateEmbeddings(
    config: EmbeddingConfig,
    texts: string[],
    taskType?: EmbeddingTaskType,
  ): Promise<number[][]>;
}

