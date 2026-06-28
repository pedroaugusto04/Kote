import type { EmbeddingConfig } from '../../../application/ports/notes/embedding.gateway.js';

export interface EmbeddingStrategy {
  generateEmbeddings(config: EmbeddingConfig, texts: string[]): Promise<number[][]>;
}
