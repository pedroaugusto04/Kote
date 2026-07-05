import { Injectable } from '@nestjs/common';

import type { QueryInput } from '../../../contracts/query.js';
import { buildPaginationMeta, DEFAULT_PAGE_SIZE } from '../../../contracts/pagination.js';
import { ContentQueryRepository } from '../../ports/notes/content.repository.js';
import { EmbeddingGateway } from '../../ports/notes/embedding.gateway.js';
import { NoteEmbeddingRepository } from '../../ports/notes/note-embedding.repository.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../ports/observability/runtime-environment.port.js';
import { rankKnowledgeMatches, rankHybridKnowledgeMatches } from '../../utils/query.utils.js';
import { noteSummary } from '../../../infrastructure/mappers/content-query.mappers.js';
import { AppLogger } from '../../../observability/logger.js';
import { EmbeddingTaskType } from '../../../contracts/enums.js';

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

    const embeddingConfig = {
      provider: this.env.embeddingAiProvider,
      baseUrl: this.env.embeddingAiBaseUrl,
      model: this.env.embeddingAiModel,
      apiKey: this.env.embeddingAiApiKey,
    };

    const projectId = input.projectId;
    const workspaceId = input.workspaceId;

    let similarChunks: Array<{ noteId: string; similarity: number }> = [];
    let candidateIds: string[] | undefined = undefined;

    // Try vector search and FTS in parallel if embeddings are configured
    const [vectorResult, ftsNotes] = await Promise.all([
      (async () => {
        if (!embeddingConfig.provider || !embeddingConfig.apiKey || !embeddingConfig.model) {
          this.logger.info('query_knowledge.embedding_not_configured');
          return { chunks: [], candidateIds: undefined };
        }
        try {
          const embeddings = await this.embeddingGateway.generateEmbeddings(embeddingConfig, [input.query], EmbeddingTaskType.Query);
          this.logger.info('query_knowledge.embedding_generated', {
            embeddingDim: embeddings[0]?.length,
          });
          
          const queryEmbedding = embeddings[0];
          if (queryEmbedding && queryEmbedding.length > 0) {
            const chunks = await this.noteEmbeddingRepository.findSimilar(userId, queryEmbedding, {
              limit: input.limit * (this.env.searchCandidateLimitMultiplier ?? 3),
              workspaceId,
              projectId,
              minSimilarity: this.env.searchMinSimilarity ?? 0.3,
            });
            this.logger.info('query_knowledge.vector_search_complete', {
              resultCount: chunks.length,
              avgSimilarity: chunks.length > 0 ? chunks.reduce((sum, r) => sum + r.similarity, 0) / chunks.length : 0,
            });
            return { chunks, candidateIds: chunks.map((c) => c.noteId) };
          }
          this.logger.warn('query_knowledge.embedding_empty');
          return { chunks: [], candidateIds: undefined };
        } catch (error) {
          this.logger.warn('query_knowledge.vector_search_failed', {
            userId,
            query: input.query,
            error: error instanceof Error ? error.message : String(error),
          });
          return { chunks: [], candidateIds: undefined };
        }
      })(),
      (async () => {
        const results = await this.contentQueryRepository.list(userId, {
          projectId,
          workspaceId,
          status: input.status,
          query: input.query,
        });
        this.logger.info('query_knowledge.fts_search_complete', {
          resultCount: results.length,
        });
        return results;
      })(),
    ]);

    this.logger.info('query_knowledge.search_phase_complete', {
      vectorChunksCount: vectorResult.chunks.length,
      ftsNotesCount: ftsNotes.length,
    });

    similarChunks = vectorResult.chunks;
    candidateIds = vectorResult.candidateIds;
    const notes = ftsNotes;

    if (candidateIds && candidateIds.length > 0 || similarChunks.length > 0) {
      const matches = rankHybridKnowledgeMatches(notes, similarChunks, input, {
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
        const pagination = buildPaginationMeta({ page: input.page || 1, pageSize: input.pageSize || DEFAULT_PAGE_SIZE }, matches.length);
        const start = (pagination.page - 1) * pagination.pageSize;

        this.logger.info('query_knowledge.complete', {
          mode: 'hybrid',
          totalMatches: matches.length,
          returnedMatches: matches.slice(start, start + pagination.pageSize).length,
        });

        return {
          ok: true,
          query: input.query,
          matches: matches.slice(start, start + pagination.pageSize),
          pagination,
          answer: matches.length
            ? {
                answer: `I found ${matches.length} relevant note(s) for "${input.query}".`,
                bullets: matches.map((match: { title: string; snippet: string }) => `${match.title}: ${match.snippet}`),
              }
            : { answer: `I did not find relevant notes for: ${input.query}`, bullets: [] },
        };
      }
    }

    // Fallback to keyword-only search
    const matches = rankKnowledgeMatches(notes, input);
    this.logger.info('query_knowledge.keyword_ranking_complete', {
      matchesCount: matches.length,
    });
    
    const pagination = buildPaginationMeta({ page: input.page || 1, pageSize: input.pageSize || DEFAULT_PAGE_SIZE }, matches.length);
    const start = (pagination.page - 1) * pagination.pageSize;

    this.logger.info('query_knowledge.complete', {
      mode: 'keyword_fallback',
      totalMatches: matches.length,
      returnedMatches: matches.slice(start, start + pagination.pageSize).length,
    });

    return {
      ok: true,
      query: input.query,
      matches: matches.slice(start, start + pagination.pageSize),
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
