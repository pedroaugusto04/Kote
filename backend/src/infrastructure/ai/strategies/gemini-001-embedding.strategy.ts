import { Injectable } from '@nestjs/common';

import type { EmbeddingConfig } from '../../../application/ports/notes/embedding.gateway.js';
import type { EmbeddingStrategy } from './embedding.strategy.js';
import { AppLogger } from '../../../observability/logger.js';
import { truncateForLog } from '../../utils/logging.js';

/**
 * Max texts per Gemini batchEmbedContents request (API limit is 100).
 */
const GEMINI_BATCH_SIZE = 100;

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
export class Gemini001EmbeddingStrategy implements EmbeddingStrategy {
  constructor(private readonly logger: AppLogger) {}

  async generateEmbeddings(
    config: EmbeddingConfig,
    texts: string[],
  ): Promise<number[][]> {
    if (!texts.length) return [];

    const batches = chunk(texts, GEMINI_BATCH_SIZE);
    const allEmbeddings: number[][] = [];

    for (const batch of batches) {
      const endpoint = `${config.baseUrl.replace(/\/$/, '')}/models/${config.model}:batchEmbedContents?key=${config.apiKey}`;

      const requestBody = {
        requests: batch.map((text) => ({
          model: `models/${config.model}`,
          content: { parts: [{ text }] },
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: 768,
        })),
      };

      this.logger.info('[Embedding] Gemini-001 batchEmbedContents', {
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
