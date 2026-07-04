import { Injectable, Optional, InternalServerErrorException } from '@nestjs/common';
import { AiProvider, EmbeddingTaskType } from '../../contracts/enums.js';
import { EmbeddingConfig, EmbeddingGateway } from '../../application/ports/notes/embedding.gateway.js';
import { AppLogger } from '../../observability/logger.js';
import type { EmbeddingStrategy } from './strategies/embedding.strategy.js';
import { Gemini001EmbeddingStrategy } from './strategies/gemini-001-embedding.strategy.js';
import { Gemini2EmbeddingStrategy } from './strategies/gemini-2-embedding.strategy.js';
import { OpenAiEmbeddingStrategy } from './strategies/openai-embedding.strategy.js';


@Injectable()
export class DefaultEmbeddingGateway extends EmbeddingGateway {
  constructor(
    private readonly logger: AppLogger,
    @Optional() private readonly gemini001Strategy?: Gemini001EmbeddingStrategy,
    @Optional() private readonly gemini2Strategy?: Gemini2EmbeddingStrategy,
    @Optional() private readonly openAiStrategy?: OpenAiEmbeddingStrategy,
  ) {
    super();
  }

  private getStrategy(config: EmbeddingConfig): EmbeddingStrategy {
    if (config.provider === AiProvider.Gemini) {
      if (config.model === 'gemini-embedding-2') {
        if (!this.gemini2Strategy) {
          throw new InternalServerErrorException('Gemini2EmbeddingStrategy not provided');
        }
        return this.gemini2Strategy;
      }

      if (!this.gemini001Strategy) {
        throw new InternalServerErrorException('Gemini001EmbeddingStrategy not provided');
      }
      return this.gemini001Strategy;
    }

    if (!this.openAiStrategy) {
      throw new InternalServerErrorException('OpenAiEmbeddingStrategy not provided');
    }
    return this.openAiStrategy;
  }

  async generateEmbeddings(
    config: EmbeddingConfig,
    texts: string[],
    taskType?: EmbeddingTaskType,
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

    const strategy = this.getStrategy(config);
    return strategy.generateEmbeddings(config, texts, taskType);
  }
}

