import { Injectable } from '@nestjs/common';

import type { QueryInput } from '../../../contracts/query.js';
import { buildPaginationMeta, DEFAULT_PAGE_SIZE } from '../../../contracts/pagination.js';
import { ContentQueryRepository } from '../../ports/notes/content.repository.js';
import { EmbeddingGateway } from '../../ports/notes/embedding.gateway.js';
import { NoteEmbeddingRepository } from '../../ports/notes/note-embedding.repository.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../ports/observability/runtime-environment.port.js';
import { rankKnowledgeMatches, rankHybridKnowledgeMatches } from '../../utils/query/query.utils.js';
import { AppLogger } from '../../../observability/logger.js';
import { EmbeddingTaskType } from '../../../contracts/enums.js';
import type { VaultNoteSummary } from '../../models/vault-note.models.js';

type QueryMatch = ReturnType<typeof rankKnowledgeMatches>[number];
type QuerySearchMode = 'hybrid' | 'keyword_fallback';

@Injectable()
export class QueryKnowledgeUseCase {
  private readonly env: RuntimeEnvironment;

  constructor(
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly embeddingGateway: EmbeddingGateway,
    private readonly noteEmbeddingRepository: NoteEmbeddingRepository,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {
    this.env = this.runtimeEnv.read();
  }

  async execute(input: QueryInput, userId: string) {
    this.logger.info('query_knowledge.start', {
      userId,
      query: input.query,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      status: input.status,
      limit: input.limit,
    });

    const [vectorResult, ftsNotes] = await Promise.all([
      this.searchVectorChunks(userId, input),
      this.searchFtsNotes(userId, input),
    ]);

    this.logger.info('query_knowledge.search_phase_complete', {
      vectorChunksCount: vectorResult.chunks.length,
      ftsNotesCount: ftsNotes.length,
    });

    const hasVectorResults = vectorResult.chunks.length > 0;
    if (hasVectorResults) {
      const matches = rankHybridKnowledgeMatches(ftsNotes, vectorResult.chunks, input, {
        vector: this.env.searchHybridVectorWeight ?? 0.4,
        keyword: this.env.searchHybridKeywordWeight ?? 0.6,
      }, this.env.searchRrfK);

      this.logger.info('query_knowledge.hybrid_ranking_complete', {
        matchesCount: matches.length,
        vectorWeight: this.env.searchHybridVectorWeight ?? 0.4,
        keywordWeight: this.env.searchHybridKeywordWeight ?? 0.6,
        rrfK: this.env.searchRrfK,
      });

      if (matches.length > 0) {
        return this.buildResponse(input, matches, 'hybrid');
      }
    }

    const keywordMatches = rankKnowledgeMatches(ftsNotes, input);
    this.logger.info('query_knowledge.keyword_ranking_complete', {
      matchesCount: keywordMatches.length,
    });

    return this.buildResponse(input, keywordMatches, 'keyword_fallback');
  }

  private ftsCandidateLimit(input: QueryInput): number {
    return input.limit * (this.env.searchCandidateLimitMultiplier ?? 4);
  }

  private async searchFtsNotes(userId: string, input: QueryInput): Promise<VaultNoteSummary[]> {
    const results = await this.contentQueryRepository.list(userId, {
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      status: input.status,
      query: input.query,
      ftsLimit: this.ftsCandidateLimit(input),
    });

    this.logger.info('query_knowledge.fts_search_complete', {
      resultCount: results.length,
    });

    return results;
  }

  private async searchVectorChunks(userId: string, input: QueryInput) {
    const embeddingConfig = {
      provider: this.env.embeddingAiProvider,
      baseUrl: this.env.embeddingAiBaseUrl,
      model: this.env.embeddingAiModel,
      apiKey: this.env.embeddingAiApiKey,
    };

    if (!embeddingConfig.provider || !embeddingConfig.apiKey || !embeddingConfig.model) {
      this.logger.info('query_knowledge.embedding_not_configured');
      return { chunks: [] as Array<{ noteId: string; similarity: number }> };
    }

    try {
      const embeddings = await this.embeddingGateway.generateEmbeddings(
        embeddingConfig,
        [input.query],
        EmbeddingTaskType.Query,
      );
      this.logger.info('query_knowledge.embedding_generated', {
        embeddingDim: embeddings[0]?.length,
      });

      const queryEmbedding = embeddings[0];
      if (!queryEmbedding?.length) {
        this.logger.warn('query_knowledge.embedding_empty');
        return { chunks: [] as Array<{ noteId: string; similarity: number }> };
      }

      const chunks = await this.noteEmbeddingRepository.findSimilar(userId, queryEmbedding, {
        limit: this.ftsCandidateLimit(input),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        minSimilarity: this.env.searchMinSimilarity ?? 0.35,
      });

      this.logger.info('query_knowledge.vector_search_complete', {
        resultCount: chunks.length,
        avgSimilarity: chunks.length > 0
          ? chunks.reduce((sum, result) => sum + result.similarity, 0) / chunks.length
          : 0,
      });

      return { chunks };
    } catch (error) {
      this.logger.warn('query_knowledge.vector_search_failed', {
        userId,
        query: input.query,
        error: error instanceof Error ? error.message : String(error),
      });
      return { chunks: [] as Array<{ noteId: string; similarity: number }> };
    }
  }

  private buildResponse(input: QueryInput, matches: QueryMatch[], mode: QuerySearchMode) {
    const pagination = buildPaginationMeta(
      { page: input.page || 1, pageSize: input.pageSize || DEFAULT_PAGE_SIZE },
      matches.length,
    );
    const start = (pagination.page - 1) * pagination.pageSize;
    const pageMatches = matches.slice(start, start + pagination.pageSize);

    this.logger.info('query_knowledge.complete', {
      mode,
      totalMatches: matches.length,
      returnedMatches: pageMatches.length,
    });

    return {
      ok: true as const,
      query: input.query,
      matches: pageMatches,
      pagination,
      answer: matches.length
        ? {
            answer: `I found ${matches.length} relevant note(s) for "${input.query}".`,
            bullets: matches.map((match) => `${match.title}: ${match.snippet}`),
          }
        : { answer: `I did not find relevant notes for: ${input.query}`, bullets: [] },
    };
  }
}
