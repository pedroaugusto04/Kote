import { Injectable } from '@nestjs/common';

import { AiProvider } from '../../contracts/enums.js';
import { EmbeddingConfig, EmbeddingGateway } from '../../application/ports/embedding.gateway.js';
import { AppLogger } from '../../observability/logger.js';

/**
 * Max texts per Gemini batchEmbedContents request (API limit is 100).
 */
const GEMINI_BATCH_SIZE = 100;

/**
 * Max texts per OpenAI-compatible /embeddings request.
 */
const OPENAI_BATCH_SIZE = 2048;

export class EmbeddingGenerationError extends Error {
  readonly provider: AiProvider;
  readonly model: string;
  readonly endpoint: string;
  readonly status?: number;
  readonly statusText?: string;
  readonly responseBody?: string;

  constructor(
    message: string,
    details: {
      provider: AiProvider;
      model: string;
      endpoint: string;
      status?: number;
      statusText?: string;
      responseBody?: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: details.cause });
    this.name = 'EmbeddingGenerationError';
    this.provider = details.provider;
    this.model = details.model;
    this.endpoint = details.endpoint;
    this.status = details.status;
    this.statusText = details.statusText;
    this.responseBody = details.responseBody;
  }
}

function truncateForLog(value: string, maxLength = 1_500) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

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
export class DefaultEmbeddingGateway extends EmbeddingGateway {
  constructor(private readonly logger: AppLogger) {
    super();
  }

  async generateEmbeddings(
    config: EmbeddingConfig,
    texts: string[],
  ): Promise<number[][]> {
    if (!texts.length) return [];

    if (config.provider === AiProvider.None || !config.apiKey || !config.model) {
      this.logger.warn('[Embedding] Skipped — missing configuration', {
        provider: config.provider,
        apiKeySet: !!config.apiKey,
        model: config.model || 'missing',
      });
      return [];
    }

    if (config.provider === AiProvider.Gemini) {
      return this.generateGeminiEmbeddings(config, texts);
    }

    return this.generateOpenAiCompatibleEmbeddings(config, texts);
  }

  // ---------------------------------------------------------------------------
  // Gemini — batchEmbedContents
  // ---------------------------------------------------------------------------

  private async generateGeminiEmbeddings(
    config: EmbeddingConfig,
    texts: string[],
  ): Promise<number[][]> {
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

      this.logger.info('[Embedding] Gemini batchEmbedContents', {
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
        throw new EmbeddingGenerationError('embedding_request_failed', {
          provider: config.provider,
          model: config.model,
          // Strip API key from logged endpoint
          endpoint: endpoint.replace(/key=[^&]+/, 'key=***'),
          cause: error,
        });
      }

      const responseText = await response.text();

      if (!response.ok) {
        throw new EmbeddingGenerationError('embedding_request_rejected', {
          provider: config.provider,
          model: config.model,
          endpoint: endpoint.replace(/key=[^&]+/, 'key=***'),
          status: response.status,
          statusText: response.statusText,
          responseBody: truncateForLog(responseText),
        });
      }

      let data: { embeddings?: Array<{ values: number[] }> };
      try {
        data = JSON.parse(responseText) as { embeddings?: Array<{ values: number[] }> };
      } catch (error) {
        throw new EmbeddingGenerationError('embedding_invalid_json', {
          provider: config.provider,
          model: config.model,
          endpoint: endpoint.replace(/key=[^&]+/, 'key=***'),
          status: response.status,
          statusText: response.statusText,
          responseBody: truncateForLog(responseText),
          cause: error,
        });
      }

      const embeddings = data.embeddings;
      if (!embeddings || embeddings.length !== batch.length) {
        throw new EmbeddingGenerationError('embedding_count_mismatch', {
          provider: config.provider,
          model: config.model,
          endpoint: endpoint.replace(/key=[^&]+/, 'key=***'),
          responseBody: `expected ${batch.length} embeddings, got ${embeddings?.length ?? 0}`,
        });
      }

      allEmbeddings.push(...embeddings.map((e) => e.values));
    }

    return allEmbeddings;
  }

  // ---------------------------------------------------------------------------
  // OpenAI-compatible — POST /embeddings
  // ---------------------------------------------------------------------------

  private async generateOpenAiCompatibleEmbeddings(
    config: EmbeddingConfig,
    texts: string[],
  ): Promise<number[][]> {
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
        throw new EmbeddingGenerationError('embedding_request_failed', {
          provider: config.provider,
          model: config.model,
          endpoint,
          cause: error,
        });
      }

      const responseText = await response.text();

      if (!response.ok) {
        throw new EmbeddingGenerationError('embedding_request_rejected', {
          provider: config.provider,
          model: config.model,
          endpoint,
          status: response.status,
          statusText: response.statusText,
          responseBody: truncateForLog(responseText),
        });
      }

      let data: { data?: Array<{ embedding: number[]; index: number }> };
      try {
        data = JSON.parse(responseText) as { data?: Array<{ embedding: number[]; index: number }> };
      } catch (error) {
        throw new EmbeddingGenerationError('embedding_invalid_json', {
          provider: config.provider,
          model: config.model,
          endpoint,
          status: response.status,
          statusText: response.statusText,
          responseBody: truncateForLog(responseText),
          cause: error,
        });
      }

      const items = data.data;
      if (!items || items.length !== batch.length) {
        throw new EmbeddingGenerationError('embedding_count_mismatch', {
          provider: config.provider,
          model: config.model,
          endpoint,
          responseBody: `expected ${batch.length} embeddings, got ${items?.length ?? 0}`,
        });
      }

      // OpenAI response items may not be in order — sort by index
      const sorted = [...items].sort((a, b) => a.index - b.index);
      allEmbeddings.push(...sorted.map((item) => item.embedding));
    }

    return allEmbeddings;
  }
}
