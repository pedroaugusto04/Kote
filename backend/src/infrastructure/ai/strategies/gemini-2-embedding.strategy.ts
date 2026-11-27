import { Injectable } from '@nestjs/common';

import type { EmbeddingConfig } from '../../../application/ports/notes/embedding.gateway.js';
import type { EmbeddingStrategy } from './embedding.strategy.js';
import { AppLogger } from '../../../observability/logger.js';
import { truncateForLog } from '../../utils/logging.js';
import { EmbeddingTaskType } from '../../../contracts/enums.js';
import { chunkArray } from '../../../domain/utils/array.utils.js';
import { RuntimeEnvironmentProvider } from '../../../application/ports/observability/runtime-environment.port.js';

/**
 * Max texts per Gemini batchEmbedContents request (API limit is 100).
 */
const GEMINI_BATCH_SIZE = 100;

@Injectable()
export class Gemini2EmbeddingStrategy implements EmbeddingStrategy {
  private readonly env: ReturnType<RuntimeEnvironmentProvider['read']>;

  constructor(
    private readonly logger: AppLogger,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
  ) {
    this.env = this.runtimeEnv.read();
  }

  async generateEmbeddings(
    config: EmbeddingConfig,
    texts: string[],
    taskType?: EmbeddingTaskType,
  ): Promise<number[][]> {
    if (!texts.length) return [];

    const batches = chunkArray(texts, GEMINI_BATCH_SIZE);
    const allEmbeddings: number[][] = [];

    for (const batch of batches) {
      const endpoint = `${config.baseUrl.replace(/\/$/, '')}/models/${config.model}:batchEmbedContents?key=${config.apiKey}`;

      const requestBody = {
        requests: batch.map((text) => ({
          model: `models/${config.model}`,
          content: { parts: [{ text }] },
          taskType: taskType === EmbeddingTaskType.Query ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
          outputDimensionality: this.env.embeddingDimension,
        })),
      };


      this.logger.info('[Embedding] Gemini-2 batchEmbedContents', {
        count: batch.length,
        model: config.model,
      });

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });
      } catch (error) {
        throw new Error('embedding_request_failed', {
          cause: error,
        });
      }

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error('embedding_request_rejected', {
          cause: {
            status: response.status,
            statusText: response.statusText,
            responseBody: truncateForLog(responseText),
          },
        });
      }

      let data: { embeddings?: Array<{ values: number[] }> };
      try {
        data = JSON.parse(responseText) as { embeddings?: Array<{ values: number[] }> };
      } catch (error) {
        throw new Error('embedding_invalid_json', {
          cause: {
            status: response.status,
            statusText: response.statusText,
            responseBody: truncateForLog(responseText),
          },
        });
      }

      const embeddings = data.embeddings;
      if (!embeddings || embeddings.length !== batch.length) {
        throw new Error('embedding_count_mismatch', {
          cause: {
            responseBody: `expected ${batch.length} embeddings, got ${embeddings?.length ?? 0}`,
          },
        });
      }

      allEmbeddings.push(...embeddings.map((e) => e.values));
    }

    return allEmbeddings;
  }
}
