import { Injectable } from '@nestjs/common';
import { ContentRepository, ContentQueryRepository } from '../../ports/notes/content.repository.js';
import { EmbeddingGateway } from '../../ports/notes/embedding.gateway.js';
import { NoteEmbeddingRepository } from '../../ports/notes/note-embedding.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { AppLogger } from '../../../observability/logger.js';
import { EmbeddingTaskType, type AiProvider } from '../../../contracts/enums.js';
import { rankHybridKnowledgeMatches } from '../../utils/query/query.utils.js';
import { filePathToQuery, isGenericFile } from '../../utils/query/file-query.utils.js';
import { noteSummary } from '../../../infrastructure/mappers/content-query.mappers.js';
import type { NoteRecord } from '../../models/repository-records.models.js';


@Injectable()
export class FindRelatedNotesByFileUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly embeddingGateway: EmbeddingGateway,
    private readonly noteEmbeddingRepository: NoteEmbeddingRepository,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {}

  async execute(userId: string, filePath: string, excludeIds: string[] = []): Promise<ReturnType<typeof noteSummary>[]> {
    const env = this.runtimeEnv.read();

    if (isGenericFile(filePath)) {
      this.logger.info('codelens_related.skipped_generic_file', { filePath });
      return [];
    }

    const queryText = filePathToQuery(filePath);
    if (!queryText) {
      this.logger.info('codelens_related.empty_query', { filePath });
      return [];
    }

    const embeddingConfig = {
      provider: env.codeLensSearchAiProvider as AiProvider,
      baseUrl: env.codeLensSearchAiBaseUrl,
      model: env.codeLensSearchAiModel,
      apiKey: env.codeLensSearchAiApiKey,
    };

    const isEmbeddingConfigured = Boolean(
      embeddingConfig.provider && embeddingConfig.apiKey && embeddingConfig.model,
    );

    this.logger.info('codelens_related.start', {
      userId,
      filePath,
      queryText,
      isEmbeddingConfigured,
    });

    const candidateLimit = env.codeLensSearchCandidateLimit;
    const excludeSet = new Set(excludeIds);

    const [vectorResult, ftsNotes] = await Promise.all([
      isEmbeddingConfigured
        ? this.searchVectorChunks(userId, queryText, embeddingConfig, env.codeLensSearchMinSimilarity, candidateLimit)
        : Promise.resolve({ chunks: [] as Array<{ noteId: string; similarity: number }> }),
      this.contentQueryRepository.list(userId, { query: queryText, ftsLimit: candidateLimit }),
    ]);

    this.logger.info('codelens_related.search_phase_complete', {
      vectorChunksCount: vectorResult.chunks.length,
      ftsNotesCount: ftsNotes.length,
    });

    const filteredFts = ftsNotes.filter((n) => !excludeSet.has(n.id));
    const filteredChunks = vectorResult.chunks.filter((c) => !excludeSet.has(c.noteId));

    const hasVectorResults = filteredChunks.length > 0;
    const queryInput = {
      query: queryText,
      limit: env.codeLensSearchResultLimit,
    } as any;

    let matches: Array<ReturnType<typeof rankHybridKnowledgeMatches>[number]>;

    if (hasVectorResults) {
      matches = rankHybridKnowledgeMatches(
        filteredFts,
        filteredChunks,
        queryInput,
        { vector: env.codeLensSearchVectorWeight, keyword: env.codeLensSearchKeywordWeight },
        env.codeLensSearchRrfK,
      );
    } else {
      // Fallback: keyword only
      matches = filteredFts
        .filter((n) => (n.ftsRank ?? 0) > 0)
        .sort((a, b) => (b.ftsRank ?? 0) - (a.ftsRank ?? 0))
        .map((n) => ({
          id: n.id,
          path: n.path,
          title: n.title,
          type: n.type,
          project: n.project,
          workspace: n.workspace,
          folderId: n.folderId,
          categories: n.categories,
          tags: n.tags,
          date: n.date,
          status: n.status,
          summary: n.summary,
          source: n.source,
          projectSlug: n.project,
          score: n.ftsRank ?? 0,
          snippet: n.summary || n.title,
          attachmentCount: n.attachmentCount,
          isPinned: n.isPinned,
        }));
    }

    const topMatches = matches.slice(0, env.codeLensSearchResultLimit);

    if (topMatches.length === 0) {
      this.logger.info('codelens_related.no_matches', { filePath, queryText });
      return [];
    }

    // Hydrate full note records for the mapper
    const noteIds = topMatches.map((m) => m.id);
    const noteRecords = await this.contentRepository.getNotesByIds(userId, noteIds);
    const noteMap = new Map<string, NoteRecord>(noteRecords.map((n) => [n.id, n]));

    const result = noteIds
      .map((id) => noteMap.get(id))
      .filter((n): n is NonNullable<typeof n> => !!n)
      .map((n) => noteSummary(n));

    this.logger.info('codelens_related.complete', {
      filePath,
      queryText,
      resultCount: result.length,
    });

    return result;
  }

  private async searchVectorChunks(
    userId: string,
    queryText: string,
    embeddingConfig: { provider: AiProvider; baseUrl: string; model: string; apiKey: string },
    minSimilarity: number,
    limit: number,
  ) {
    try {
      const embeddings = await this.embeddingGateway.generateEmbeddings(
        embeddingConfig,
        [queryText],
        EmbeddingTaskType.Query,
      );
      const queryEmbedding = embeddings[0];
      if (!queryEmbedding?.length) {
        this.logger.warn('codelens_related.embedding_empty', { queryText });
        return { chunks: [] as Array<{ noteId: string; similarity: number }> };
      }

      const chunks = await this.noteEmbeddingRepository.findSimilar(userId, queryEmbedding, {
        limit,
        minSimilarity,
      });

      return { chunks };
    } catch (error) {
      this.logger.warn('codelens_related.vector_search_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { chunks: [] as Array<{ noteId: string; similarity: number }> };
    }
  }
}
