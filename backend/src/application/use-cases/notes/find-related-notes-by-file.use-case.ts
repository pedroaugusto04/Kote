import { Injectable } from '@nestjs/common';
import { ContentRepository, ContentQueryRepository } from '../../ports/notes/content.repository.js';
import { EmbeddingRepresentation } from '../../ports/notes/note-embedding.repository.js';
import { VectorChunkSearchService } from '../../services/query/vector-chunk-search.service.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { AppLogger } from '../../../observability/logger.js';
import { rankHybridKnowledgeMatches } from '../../utils/query/query.utils.js';
import { filePathToQuery, isGenericFile } from '../../utils/query/file-query.utils.js';
import { noteSummary } from '../../mappers/vault-note.mapper.js';
import type { NoteRecord } from '../../models/repository-records.models.js';
import { extractCodeTokens } from '../../utils/notes/snippet-notes.utils.js';
import { CODE_LINEAGE_RELEVANCE_THRESHOLDS } from '../../utils/notes/code-lineage.utils.js';

export type RelatedNotesSearchProfile = 'file' | 'snippet';

export interface FindRelatedNotesByFileInput {
  userId: string;
  filePath: string;
  excludeIds?: string[];
  customQuery?: string;
  projectSlug?: string;
  requestedLimit?: number;
  searchProfile?: RelatedNotesSearchProfile;
}

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
    private readonly vectorChunkSearch: VectorChunkSearchService,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {}

  async execute(input: FindRelatedNotesByFileInput): Promise<ReturnType<typeof noteSummary>[]> {
    const {
      userId,
      filePath,
      excludeIds = [],
      customQuery,
      projectSlug,
      requestedLimit,
      searchProfile = 'file',
    } = input;

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

    const isEmbeddingConfigured = this.vectorChunkSearch.isEmbeddingConfigured(env);
    const ftsQueryText = searchProfile === 'snippet'
      ? extractCodeTokens(queryText).slice(0, 32).join(' ')
      : queryText;

    this.logger.info('codelens_related.start', {
      userId,
      filePath,
      queryText,
      projectSlug,
      searchProfile,
      resultLimit,
      isEmbeddingConfigured,
      ftsQueryText,
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
        ? this.vectorChunkSearch.search({
            userId,
            queryText,
            limit: candidateLimit,
            minSimilarity: searchConfig.minSimilarity,
            projectId,
            representations: [EmbeddingRepresentation.Raw],
            rawCandidateMultiplier: 4,
            maxRawCandidates: 200,
            deduplicateByNote: true,
            logPrefix: 'codelens_related',
          })
        : Promise.resolve({ chunks: [] as Array<{ noteId: string; similarity: number }> }),
      ftsQueryText
        ? this.contentQueryRepository.list(userId, { query: ftsQueryText, ftsLimit: candidateLimit, projectSlug })
        : Promise.resolve([]),
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
    const ftsNoteIds = new Set(filteredFts.map((note) => note.id));
    const vectorOnlyIds = Array.from(new Set(filteredChunks.map((chunk) => chunk.noteId)))
      .filter((noteId) => !ftsNoteIds.has(noteId));
    const vectorOnlyRecords = vectorOnlyIds.length > 0
      ? await this.contentRepository.getNotesByIds(userId, vectorOnlyIds)
      : [];
    const vectorOnlyNotes = vectorOnlyRecords.map((note) => ({
      ...noteSummary(note),
      ftsRank: 0,
    }));
    const hybridCandidates = [...filteredFts, ...vectorOnlyNotes];

    this.logger.info('codelens_related.candidates_merged', {
      ftsCandidatesCount: filteredFts.length,
      vectorOnlyCandidatesCount: vectorOnlyNotes.length,
      totalCandidatesCount: hybridCandidates.length,
    });

    const queryInput = {
      query: queryText,
      limit: resultLimit,
    };

    let matches: Array<ReturnType<typeof rankHybridKnowledgeMatches>[number]>;

    if (hasVectorResults) {
      matches = rankHybridKnowledgeMatches(
        hybridCandidates,
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

    const relevantMatches = searchProfile === 'snippet'
      ? matches.filter((match) => {
          const semanticSim = semanticSimilarityByNoteId.get(match.id) || 0;
          if (semanticSim >= CODE_LINEAGE_RELEVANCE_THRESHOLDS.semanticSimilarity) {
            return true;
          }
          if (!hasVectorResults && match.score > 0) {
            return true;
          }
          return false;
        })
      : matches;
    const topMatches = relevantMatches.slice(0, resultLimit);

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
        ...(searchProfile === 'snippet' ? { lineageCategory: 'cross-file-related' as const } : {}),
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
}
