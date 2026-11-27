import { Injectable } from '@nestjs/common';
import { AiProvider, type EmbeddingTaskType } from '../../contracts/enums.js';
import { type EmbeddingConfig, EmbeddingGateway } from '../../application/ports/notes/embedding.gateway.js';
import { EmbeddingStrategyNotAvailableException } from '../../domain/exceptions/index.js';
import { AppLogger } from '../../observability/logger.js';
import type { EmbeddingStrategy } from './strategies/embedding.strategy.js';
import { Gemini001EmbeddingStrategy } from './strategies/gemini-001-embedding.strategy.js';
import { Gemini2EmbeddingStrategy } from './strategies/gemini-2-embedding.strategy.js';
import { OpenAiEmbeddingStrategy } from './strategies/openai-embedding.strategy.js';


@Injectable()
export class DefaultEmbeddingGateway extends EmbeddingGateway {
  constructor(
    private readonly logger: AppLogger,
    private readonly gemini001Strategy: Gemini001EmbeddingStrategy,
    private readonly gemini2Strategy: Gemini2EmbeddingStrategy,
    private readonly openAiStrategy: OpenAiEmbeddingStrategy,
  ) {
    super();
  }

  private getStrategy(config: EmbeddingConfig): EmbeddingStrategy {
    if (config.provider === AiProvider.Gemini) {
      return config.model === 'gemini-embedding-2'
        ? this.gemini2Strategy
        : this.gemini001Strategy;
    }

    if (config.provider === AiProvider.Ollama || config.provider === AiProvider.OpenAi) {
      return this.openAiStrategy;
    }

    throw new EmbeddingStrategyNotAvailableException({ provider: config.provider });
  }

  async generateEmbeddings(
    config: EmbeddingConfig,
    texts: string[],
    taskType?: EmbeddingTaskType,
  ): Promise<number[][]> {
    if (!texts.length) return [];

    const isApiKeyRequired = config.provider !== AiProvider.Ollama;
    if (config.provider === AiProvider.None || (isApiKeyRequired && !config.apiKey) || !config.model) {
      this.logger.warn('[Embedding] Skipped — missing configuration', {
        provider: config.provider,
        apiKeySet: !!config.apiKey,
        model: config.model || 'missing',
      });
      return [];
    }

    const strategy = this.getStrategy(config);
    const strategyConfig = {
      ...config,
      apiKey: config.apiKey || 'ollama',
    };
    return strategy.generateEmbeddings(strategyConfig, texts, taskType);
  }
}

