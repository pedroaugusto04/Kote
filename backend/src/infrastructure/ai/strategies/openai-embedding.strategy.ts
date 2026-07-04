import { Injectable } from '@nestjs/common';

import type { EmbeddingConfig } from '../../../application/ports/notes/embedding.gateway.js';
import type { EmbeddingStrategy } from './embedding.strategy.js';
import { AppLogger } from '../../../observability/logger.js';
import { truncateForLog } from '../../utils/logging.js';
import { EmbeddingTaskType } from '../../../contracts/enums.js';

/**
 * Max texts per OpenAI-compatible /embeddings request.
 */
const OPENAI_BATCH_SIZE = 2048;

/**
 * Split an array into chunks of at most `size` elements.
 */
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

@Injectable()
export class OpenAiEmbeddingStrategy implements EmbeddingStrategy {
  constructor(private readonly logger: AppLogger) {}

  async generateEmbeddings(
    config: EmbeddingConfig,
    texts: string[],
    taskType?: EmbeddingTaskType,
  ): Promise<number[][]> {
    if (!texts.length) return [];

    const batches = chunk(texts, OPENAI_BATCH_SIZE);

    const allEmbeddings: number[][] = [];

    for (const batch of batches) {
      const endpoint = `${config.baseUrl.replace(/\/$/, '')}/embeddings`;

      const requestBody = {
        model: config.model,
        input: batch,
      };

      this.logger.info('[Embedding] OpenAI-compatible embeddings', {
        count: batch.length,
        model: config.model,
        provider: config.provider,
      });

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
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

      let data: { data?: Array<{ embedding: number[]; index: number }> };
      try {
        data = JSON.parse(responseText) as { data?: Array<{ embedding: number[]; index: number }> };
      } catch (error) {
        throw new Error('embedding_invalid_json', {
          cause: {
            status: response.status,
            statusText: response.statusText,
            responseBody: truncateForLog(responseText),
          },
        });
      }

      const items = data.data;
      if (!items || items.length !== batch.length) {
        throw new Error('embedding_count_mismatch', {
          cause: {
            responseBody: `expected ${batch.length} embeddings, got ${items?.length ?? 0}`,
          },
        });
      }

      // OpenAI response items may not be in order — sort by index
      const sorted = [...items].sort((a, b) => a.index - b.index);
      allEmbeddings.push(...sorted.map((item) => item.embedding));
    }

    return allEmbeddings;
  }
}
