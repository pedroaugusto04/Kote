import type { AiProvider } from '../../../contracts/enums.js';

export type EmbeddingConfig = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export abstract class EmbeddingGateway {
  abstract generateEmbeddings(
    config: EmbeddingConfig,
    texts: string[],
  ): Promise<number[][]>;
}
