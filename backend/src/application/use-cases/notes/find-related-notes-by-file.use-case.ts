import { Injectable } from '@nestjs/common';
import { ContentRepository, ContentQueryRepository } from '../../ports/notes/content.repository.js';
import { EmbeddingGateway } from '../../ports/notes/embedding.gateway.js';
import { NoteEmbeddingRepository } from '../../ports/notes/note-embedding.repository.js';
import { EmbeddingQueuePublisher } from '../../ports/notes/embedding-queue.publisher.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { AppLogger } from '../../../observability/logger.js';
import { EmbeddingTaskType, type AiProvider } from '../../../contracts/enums.js';
import { rankHybridKnowledgeMatches } from '../../utils/query/query.utils.js';
import { filePathToQuery, isGenericFile } from '../../utils/query/file-query.utils.js';
import { noteSummary } from '../../../infrastructure/mappers/content-query.mappers.js';
import type { NoteRecord } from '../../models/repository-records.models.js';

type RelatedNotesSearchProfile = 'file' | 'snippet';

type RelatedNotesSearchConfig = {
  minSimilarity: number;
  candidateLimit: number;
  vectorWeight: number;
  keywordWeight: number;
  rrfK: number;
  resultLimit: number;
};

@Injectable()
export class FindRelatedNotesByFileUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly embeddingGateway: EmbeddingGateway,
    private readonly noteEmbeddingRepository: NoteEmbeddingRepository,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
    private readonly embeddingQueue: EmbeddingQueuePublisher,
  ) {}

  async execute(
    userId: string,
    filePath: string,
    excludeIds: string[] = [],
    customQuery?: string,
    projectSlug?: string,
    requestedLimit?: number,
    searchProfile: RelatedNotesSearchProfile = 'file',
  ): Promise<ReturnType<typeof noteSummary>[]> {
    const env = this.runtimeEnv.read();
    const searchConfig = this.resolveSearchConfig(env, searchProfile);
    const resultLimit = Math.min(requestedLimit || searchConfig.resultLimit, searchConfig.resultLimit);

    const isGeneric = isGenericFile(filePath);
    const fileQuery = isGeneric ? '' : filePathToQuery(filePath);
    // A selection is a much stronger signal than its file path. The path is a
    // fallback for callers that do not provide selected code.
    const queryText = customQuery?.trim() || fileQuery;

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
      projectSlug,
      searchProfile,
      resultLimit,
      isEmbeddingConfigured,
    });

    const candidateLimit = searchConfig.candidateLimit;
    const excludeSet = new Set(excludeIds);

    let projectId: string | undefined;
    if (projectSlug) {
      const project = await this.contentRepository.getProjectBySlug(userId, projectSlug);
      if (project) {
        projectId = project.id;
      }
    }

    const [vectorResult, ftsNotes] = await Promise.all([
      isEmbeddingConfigured
        ? this.searchVectorChunks(userId, queryText, embeddingConfig, searchConfig.minSimilarity, candidateLimit, projectId)
        : Promise.resolve({ chunks: [] as Array<{ noteId: string; similarity: number }> }),
      this.contentQueryRepository.list(userId, { query: queryText, ftsLimit: candidateLimit, projectSlug }),
    ]);

    this.logger.info('codelens_related.search_phase_complete', {
      vectorChunksCount: vectorResult.chunks.length,
      ftsNotesCount: ftsNotes.length,
    });

    const filteredFts = ftsNotes.filter((n) => !excludeSet.has(n.id));
    const filteredChunks = vectorResult.chunks.filter((c) => !excludeSet.has(c.noteId));
    const semanticSimilarityByNoteId = new Map<string, number>();
    for (const chunk of filteredChunks) {
      const currentSimilarity = semanticSimilarityByNoteId.get(chunk.noteId) || 0;
      if (chunk.similarity > currentSimilarity) {
        semanticSimilarityByNoteId.set(chunk.noteId, chunk.similarity);
      }
    }

    const hasVectorResults = filteredChunks.length > 0;
    const queryInput = {
      query: queryText,
      limit: resultLimit,
    } as any;

    let matches: Array<ReturnType<typeof rankHybridKnowledgeMatches>[number]>;

    if (hasVectorResults) {
      matches = rankHybridKnowledgeMatches(
        filteredFts,
        filteredChunks,
        queryInput,
        { vector: searchConfig.vectorWeight, keyword: searchConfig.keywordWeight },
        searchConfig.rrfK,
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

    const topMatches = matches.slice(0, resultLimit);

    if (topMatches.length === 0) {
      this.logger.info('codelens_related.no_matches', { filePath, queryText });
      return [];
    }

    // Hydrate full note records for the mapper
    const noteIds = topMatches.map((m) => m.id);
    const matchByNoteId = new Map(topMatches.map((match) => [match.id, match]));
    const noteRecords = await this.contentRepository.getNotesByIds(userId, noteIds);
    const noteMap = new Map<string, NoteRecord>(noteRecords.map((n) => [n.id, n]));

    const result = noteIds
      .map((id) => noteMap.get(id))
      .filter((n): n is NonNullable<typeof n> => !!n)
      .map((n) => ({
        ...noteSummary(n),
        relevanceScore: matchByNoteId.get(n.id)?.score,
        semanticSimilarity: semanticSimilarityByNoteId.get(n.id),
      }));

    this.logger.info('codelens_related.complete', {
      filePath,
      queryText,
      resultCount: result.length,
    });

    return result;
  }

  private resolveSearchConfig(
    env: ReturnType<RuntimeEnvironmentProvider['read']>,
    searchProfile: RelatedNotesSearchProfile,
  ): RelatedNotesSearchConfig {
    if (searchProfile === 'snippet') {
      return {
        minSimilarity: env.codeLensSnippetSearchMinSimilarity,
        candidateLimit: env.codeLensSnippetSearchCandidateLimit,
        vectorWeight: env.codeLensSnippetSearchVectorWeight,
        keywordWeight: env.codeLensSnippetSearchKeywordWeight,
        rrfK: env.codeLensSnippetSearchRrfK,
        resultLimit: env.codeLensSnippetSearchResultLimit,
      };
    }

    return {
      minSimilarity: env.codeLensSearchMinSimilarity,
      candidateLimit: env.codeLensSearchCandidateLimit,
      vectorWeight: env.codeLensSearchVectorWeight,
      keywordWeight: env.codeLensSearchKeywordWeight,
      rrfK: env.codeLensSearchRrfK,
      resultLimit: env.codeLensSearchResultLimit,
    };
  }

  private async searchVectorChunks(
    userId: string,
    queryText: string,
    embeddingConfig: { provider: AiProvider; baseUrl: string; model: string; apiKey: string },
    minSimilarity: number,
    limit: number,
    projectId?: string,
  ) {
    try {
      const embeddings = await this.embeddingQueue.publishQueryEmbedding({
        userId,
        queryText,
      });
      const queryEmbedding = embeddings[0];
      if (!queryEmbedding?.length) {
        this.logger.warn('codelens_related.embedding_empty', { queryText });
        return { chunks: [] as Array<{ noteId: string; similarity: number }> };
      }

      const chunks = await this.noteEmbeddingRepository.findSimilar(userId, queryEmbedding, {
        limit,
        minSimilarity,
        projectId,
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
