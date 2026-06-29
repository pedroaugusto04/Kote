import { Injectable } from '@nestjs/common';

import type { QueryInput } from '../../../contracts/query.js';
import { buildPaginationMeta, DEFAULT_PAGE_SIZE } from '../../../contracts/pagination.js';
import { ContentQueryRepository } from '../../ports/notes/content.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { EmbeddingGateway } from '../../ports/notes/embedding.gateway.js';
import { NoteEmbeddingRepository } from '../../ports/notes/note-embedding.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { rankKnowledgeMatches, rankHybridKnowledgeMatches } from '../../utils/query.utils.js';
import { noteSummary } from '../../../infrastructure/mappers/content-query.mappers.js';
import { AppLogger } from '../../../observability/logger.js';

@Injectable()
export class QueryKnowledgeUseCase {
  constructor(
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly contentRepository: ContentRepository,
    private readonly embeddingGateway: EmbeddingGateway,
    private readonly noteEmbeddingRepository: NoteEmbeddingRepository,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {}

  async execute(input: QueryInput, userId: string) {
    const env = this.runtimeEnv.read();
    const notes = await this.contentQueryRepository.list(userId);
    const embeddingConfig = {
      provider: env.embeddingAiProvider,
      baseUrl: env.embeddingAiBaseUrl,
      model: env.embeddingAiModel,
      apiKey: env.embeddingAiApiKey,
    };

    // Try vector search first if embeddings are configured
    if (embeddingConfig.provider && embeddingConfig.apiKey && embeddingConfig.model) {
      try {
        const embeddings = await this.embeddingGateway.generateEmbeddings(embeddingConfig, [input.query]);
        const queryEmbedding = embeddings[0];

        if (queryEmbedding && queryEmbedding.length > 0) {
          const similarChunks = await this.noteEmbeddingRepository.findSimilar(userId, queryEmbedding, {
            limit: input.limit * 3, // Fetch more candidates for hybrid re-ranking
            workspaceSlug: input.workspaceSlug,
            projectSlug: input.projectSlug,
            minSimilarity: 0.3, // Lower threshold for hybrid search
          });

          const matches = rankHybridKnowledgeMatches(notes, similarChunks, input, { vector: 0.4, keyword: 0.6 });
          if (matches.length > 0) {
            const pagination = buildPaginationMeta({ page: input.page || 1, pageSize: input.pageSize || DEFAULT_PAGE_SIZE }, matches.length);
            const start = (pagination.page - 1) * pagination.pageSize;

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
      } catch (error) {
        // Fall back to keyword search if vector search fails
        this.logger.warn('query_knowledge.vector_search_failed', {
          userId,
          query: input.query,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback to keyword-only search
    const matches = rankKnowledgeMatches(notes, input);
    const pagination = buildPaginationMeta({ page: input.page || 1, pageSize: input.pageSize || DEFAULT_PAGE_SIZE }, matches.length);
    const start = (pagination.page - 1) * pagination.pageSize;
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
