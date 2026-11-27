import { Injectable } from '@nestjs/common';

import { AiProvider } from '../../../contracts/enums.js';
import {
  EmbeddingRepresentation,
  NoteEmbeddingRepository,
  type FindSimilarOptions,
  type SimilarChunk,
} from '../../ports/notes/note-embedding.repository.js';
import { EmbeddingQueuePublisher } from '../../ports/notes/embedding-queue.publisher.js';
import {
  RuntimeEnvironmentProvider,
  type RuntimeEnvironment,
} from '../../ports/observability/runtime-environment.port.js';
import { AppLogger } from '../../../observability/logger.js';

export interface VectorChunkSearchOptions {
  userId: string;
  queryText: string;
  limit: number;
  minSimilarity: number;
  workspaceId?: string;
  projectId?: string;
  representations?: EmbeddingRepresentation[];
  synthesisBoost?: number;
  rawCandidateMultiplier?: number;
  maxRawCandidates?: number;
  deduplicateByNote?: boolean;
  logPrefix?: string;
}

export interface VectorChunkSearchResult {
  chunks: SimilarChunk[];
}

@Injectable()
export class VectorChunkSearchService {
  constructor(
    private readonly noteEmbeddingRepository: NoteEmbeddingRepository,
    private readonly embeddingQueue: EmbeddingQueuePublisher,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {}

  isEmbeddingConfigured(env: RuntimeEnvironment = this.runtimeEnv.read()): boolean {
    return Boolean(
      env.embeddingAiProvider
      && env.embeddingAiProvider !== AiProvider.None
      && env.embeddingAiApiKey
      && env.embeddingAiModel,
    );
  }

  async search(options: VectorChunkSearchOptions): Promise<VectorChunkSearchResult> {
    const prefix = options.logPrefix || 'vector_chunk_search';

    if (!this.isEmbeddingConfigured()) {
      this.logger.info(`${prefix}.embedding_not_configured`);
      return { chunks: [] };
    }

    try {
      const embeddings = await this.embeddingQueue.publishQueryEmbedding({
        userId: options.userId,
        queryText: options.queryText,
      });
      const queryEmbedding = embeddings[0];

      this.logger.info(`${prefix}.embedding_generated`, {
        embeddingDim: queryEmbedding?.length,
      });

      if (!queryEmbedding?.length) {
        this.logger.warn(`${prefix}.embedding_empty`, { queryText: options.queryText });
        return { chunks: [] };
      }

      const representations = options.representations?.length
        ? options.representations
        : [EmbeddingRepresentation.Raw];
      const candidateLimit = options.rawCandidateMultiplier
        ? Math.min(options.limit * options.rawCandidateMultiplier, options.maxRawCandidates ?? 200)
        : options.limit;

      const chunkSets = await Promise.all(
        representations.map((representation) => {
          const searchOptions: FindSimilarOptions = {
            limit: candidateLimit,
            minSimilarity: options.minSimilarity,
            projectId: options.projectId,
            representation,
            ...(options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {}),
            ...(options.synthesisBoost !== undefined ? { synthesisBoost: options.synthesisBoost } : {}),
          };
          return this.noteEmbeddingRepository.findSimilar(options.userId, queryEmbedding, searchOptions);
        }),
      );

      let chunks = chunkSets.flat();

      if (options.deduplicateByNote) {
        chunks = Array.from(
          chunks.reduce((byNote, chunk) => {
            const current = byNote.get(chunk.noteId);
            if (!current || chunk.similarity > current.similarity) {
              byNote.set(chunk.noteId, chunk);
            }
            return byNote;
          }, new Map<string, SimilarChunk>()).values(),
        ).slice(0, options.limit);
      }

      this.logger.info(`${prefix}.vector_search_complete`, {
        resultCount: chunks.length,
        avgSimilarity: chunks.length > 0
          ? chunks.reduce((sum, result) => sum + result.similarity, 0) / chunks.length
          : 0,
      });

      return { chunks };
    } catch (error) {
      this.logger.warn(`${prefix}.vector_search_failed`, {
        userId: options.userId,
        query: options.queryText,
        error: error instanceof Error ? error.message : String(error),
      });
      return { chunks: [] };
    }
  }
}
