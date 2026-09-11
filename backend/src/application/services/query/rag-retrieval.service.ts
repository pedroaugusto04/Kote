import { Injectable, Optional } from '@nestjs/common';
import { EmbeddingGateway, type EmbeddingConfig } from '../../ports/notes/embedding.gateway.js';
import { EmbeddingRepresentation, NoteEmbeddingRepository, type SimilarChunk } from '../../ports/notes/note-embedding.repository.js';
import { EmbeddingQueuePublisher } from '../../ports/notes/embedding-queue.publisher.js';
import { ContentRepository, ContentQueryRepository } from '../../ports/notes/content.repository.js';
import { NoteSynthesisRepository } from '../../ports/notes/note-synthesis.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import type { NoteRecord } from '../../models/repository-records.models.js';
import type { VaultNoteSummary } from '../../models/vault-note.models.js';
import type { NoteSynthesisRecord } from '../../models/note-synthesis.models.js';
import { isDependencyNote } from '../../../domain/utils/note-embedding.utils.js';
import { selectTopFtsOnlyChunksPerNote } from '../../utils/query/query.utils.js';
import { chunkRankKey, rankHybridContextChunks } from '../../utils/rag/hybrid-rag.utils.js';
import { noteSummary } from '../../../infrastructure/mappers/content-query.mappers.js';
import { NoteSynthesisStatus } from '../../constants/ai-session-synthesis.constants.js';
import { getAiSessionSourceHash } from '../content/ai-session-synthesis-transcript.service.js';
import { SourceChannel } from '../../../domain/enums/knowledge.enums.js';

export type CandidateChunk = {
  noteId: string;
  chunkIndex: number;
  chunkText: string;
  similarity: number;
  representation?: EmbeddingRepresentation;
  sourceRefs?: number[];
};

export type RankedCandidate = { chunk: CandidateChunk; note: NoteRecord; hybridScore: number };

export type RagScope = {
  workspaceId?: string;
  projectId?: string;
};

export type RagConfig = {
  candidateLimit: number;
  minSimilarity: number;
  hybridVectorWeight: number;
  hybridKeywordWeight: number;
  topChunksLimit: number;
  rrfK: number;
  recencyBonusEnabled: boolean;
  recencyMaxBonus: number;
  recencyMaxBonusDays: number;
};

export interface HybridRetrievalResult {
  rankedChunks: RankedCandidate[];
  noteMap: Map<string, NoteRecord>;
  validSyntheses: Map<string, NoteSynthesisRecord>;
}

@Injectable()
export class RagRetrievalService {
  constructor(
    private readonly embeddingGateway: EmbeddingGateway,
    private readonly noteEmbeddingRepository: NoteEmbeddingRepository,
    private readonly contentRepository: ContentRepository,
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly embeddingQueue: EmbeddingQueuePublisher,
    private readonly logger: AppLogger,
    @Optional() private readonly synthesisRepository?: NoteSynthesisRepository,
  ) {}

  async retrieveHybridChunks(
    userId: string,
    queryText: string,
    options: RagScope,
    embeddingConfig: EmbeddingConfig,
    ragConfig: RagConfig,
  ): Promise<HybridRetrievalResult> {
    const [vectorChunks, ftsNotes] = await Promise.all([
      this.searchVectorCandidateChunks(userId, queryText, options, embeddingConfig, ragConfig),
      this.searchFtsCandidateNotes(userId, queryText, options, ragConfig.candidateLimit),
    ]);

    this.logger.info('ask_knowledge.rag_phase1_complete', {
      vectorChunksCount: vectorChunks.length,
      ftsNotesCount: ftsNotes.length,
    });

    if (vectorChunks.length === 0 && ftsNotes.length === 0) {
      this.logger.info('ask_knowledge.no_results_phase1');
      return { rankedChunks: [], noteMap: new Map(), validSyntheses: new Map() };
    }

    const { additionalChunks, ftsOnlyKeywordScoreByChunkKey } = await this.loadFtsOnlyChunks(
      userId,
      queryText,
      vectorChunks,
      ftsNotes,
    );

    this.logger.info('ask_knowledge.rag_phase2_complete', {
      additionalChunksCount: additionalChunks.length,
    });

    const allChunks = [...vectorChunks, ...additionalChunks];
    if (allChunks.length === 0) {
      this.logger.info('ask_knowledge.no_chunks_after_phase2');
      return { rankedChunks: [], noteMap: new Map(), validSyntheses: new Map() };
    }

    const noteIds = Array.from(new Set(allChunks.map((chunk) => chunk.noteId)));
    const rawNotes = await this.contentRepository.getNotesByIds(userId, noteIds);
    const notes = rawNotes.filter((note) => !isDependencyNote(note));
    const validSyntheses = await this.loadValidSyntheses(userId, notes);
    this.logger.info('ask_knowledge.notes_fetched', {
      requestedIds: noteIds.length,
      fetchedNotes: notes.length,
    });

    const ftsNotesMap = new Map(ftsNotes.map((note) => [note.id, note]));
    const noteMap = new Map(notes.map((note) => [note.id, note]));

    const scoredChunks = allChunks
      .map((chunk) => this.scoreCandidateChunk(chunk, noteMap, ftsNotesMap, ftsOnlyKeywordScoreByChunkKey))
      .filter((item): item is NonNullable<typeof item> => item !== null);

    this.logChunkScoreSummary(allChunks.length, scoredChunks);

    const rankedChunks = rankHybridContextChunks(scoredChunks, {
      vectorWeight: ragConfig.hybridVectorWeight,
      keywordWeight: ragConfig.hybridKeywordWeight,
      rrfK: ragConfig.rrfK,
      topLimit: ragConfig.topChunksLimit,
      recencyBonusEnabled: ragConfig.recencyBonusEnabled,
      recencyMaxBonus: ragConfig.recencyMaxBonus,
      recencyMaxBonusDays: ragConfig.recencyMaxBonusDays,
    });

    this.logger.info('ask_knowledge.rrf_complete', {
      k: ragConfig.rrfK,
      rrfK: ragConfig.rrfK,
      topChunksLimit: ragConfig.topChunksLimit,
      rankedChunksCount: rankedChunks.length,
      recencyBonusEnabled: ragConfig.recencyBonusEnabled,
      recencyMaxBonus: ragConfig.recencyMaxBonus,
      recencyMaxBonusDays: ragConfig.recencyMaxBonusDays,
      avgHybridScore:
        rankedChunks.length > 0
          ? rankedChunks.reduce((sum, result) => sum + result.hybridScore, 0) / rankedChunks.length
          : 0,
    });

    return { rankedChunks, noteMap, validSyntheses };
  }

  async searchVectorCandidateChunks(
    userId: string,
    queryText: string,
    options: RagScope,
    embeddingConfig: EmbeddingConfig,
    ragConfig: { candidateLimit: number; minSimilarity: number },
  ): Promise<SimilarChunk[]> {
    try {
      const embeddings = await this.embeddingQueue.publishQueryEmbedding({
        userId,
        queryText,
      });
      this.logger.info('ask_knowledge.embedding_generated', {
        embeddingDim: embeddings[0]?.length,
        embeddingFirstValues: embeddings[0]?.slice(0, 3),
        embeddingValid: Boolean(embeddings[0]?.length),
      });

      const questionEmbedding = embeddings[0];
      if (!questionEmbedding?.length) {
        this.logger.warn('ask_knowledge.embedding_empty');
        return [];
      }

      this.logger.info('ask_knowledge.vector_search_start', {
        minSimilarity: ragConfig.minSimilarity,
        candidateLimit: ragConfig.candidateLimit,
      });

      const [synthesisResults, rawResults] = await Promise.all([
        this.noteEmbeddingRepository.findSimilar(userId, questionEmbedding, {
          limit: ragConfig.candidateLimit,
          workspaceId: options.workspaceId,
          projectId: options.projectId,
          minSimilarity: ragConfig.minSimilarity,
          representation: EmbeddingRepresentation.Synthesis,
          synthesisBoost: 0,
        }),
        this.noteEmbeddingRepository.findSimilar(userId, questionEmbedding, {
          limit: ragConfig.candidateLimit,
          workspaceId: options.workspaceId,
          projectId: options.projectId,
          minSimilarity: ragConfig.minSimilarity,
          representation: EmbeddingRepresentation.Raw,
          synthesisBoost: 0,
        }),
      ]);
      const results = Array.from(
        new Map(
          [...synthesisResults, ...rawResults].map((chunk) => [
            chunkRankKey(chunk.noteId, chunk.chunkIndex, chunk.representation),
            chunk,
          ] as const),
        ).values(),
      );

      this.logger.info('ask_knowledge.vector_search_complete', {
        resultCount: results.length,
        avgSimilarity:
          results.length > 0
            ? results.reduce((sum, result) => sum + result.similarity, 0) / results.length
            : 0,
        maxSimilarity: results.length > 0 ? Math.max(...results.map((result) => result.similarity)) : 0,
        minSimilarityFound: results.length > 0 ? Math.min(...results.map((result) => result.similarity)) : 0,
        top3Similarities: results.slice(0, 3).map((result) => result.similarity),
      });

      return results;
    } catch (error) {
      this.logger.warn('ask_knowledge.vector_search_failed_in_hybrid', {
        userId,
        query: queryText,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  async searchFtsCandidateNotes(
    userId: string,
    queryText: string,
    options: RagScope,
    candidateLimit: number,
  ): Promise<VaultNoteSummary[]> {
    if (!this.contentQueryRepository) {
      return [];
    }

    try {
      const results = await this.contentQueryRepository.list(userId, {
        projectId: options.projectId,
        workspaceId: options.workspaceId,
        query: queryText,
        ftsLimit: candidateLimit,
      });
      this.logger.info('ask_knowledge.fts_search_complete', {
        resultCount: results.length,
      });
      return results;
    } catch (error) {
      this.logger.warn('ask_knowledge.fts_search_failed_in_hybrid', {
        userId,
        query: queryText,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  async loadFtsOnlyChunks(
    userId: string,
    queryText: string,
    vectorChunks: SimilarChunk[],
    ftsNotes: VaultNoteSummary[],
  ) {
    const vectorNoteIds = new Set(vectorChunks.map((chunk) => chunk.noteId));
    const missingFtsNoteIds = ftsNotes
      .map((note) => note.id)
      .filter((noteId) => !vectorNoteIds.has(noteId));

    this.logger.info('ask_knowledge.missing_fts_notes', {
      missingCount: missingFtsNoteIds.length,
      totalFtsNotes: ftsNotes.length,
    });

    if (missingFtsNoteIds.length === 0) {
      return {
        additionalChunks: [] as CandidateChunk[],
        ftsOnlyKeywordScoreByChunkKey: new Map<string, number>(),
      };
    }

    try {
      const storedChunks = await this.noteEmbeddingRepository.getNotesEmbeddings(userId, missingFtsNoteIds);
      const ftsRankByNoteId = new Map(
        ftsNotes
          .filter((note) => missingFtsNoteIds.includes(note.id))
          .map((note) => [note.id, note.ftsRank ?? 0]),
      );
      const selectedFtsChunks = selectTopFtsOnlyChunksPerNote(storedChunks, queryText, ftsRankByNoteId);

      this.logger.info('ask_knowledge.fts_embeddings_fetched', {
        requestedIds: missingFtsNoteIds.length,
        fetchedChunks: storedChunks.length,
        selectedChunks: selectedFtsChunks.length,
      });

      const ftsOnlyKeywordScoreByChunkKey = new Map<string, number>();
      const additionalChunks = selectedFtsChunks.map(({ chunk, keywordScore }) => {
        ftsOnlyKeywordScoreByChunkKey.set(
          chunkRankKey(chunk.noteId, chunk.chunkIndex, chunk.representation),
          keywordScore,
        );
        return {
          noteId: chunk.noteId,
          chunkIndex: chunk.chunkIndex,
          chunkText: chunk.chunkText,
          similarity: 0,
          representation: chunk.representation,
          sourceRefs: chunk.sourceRefs,
        };
      });

      return { additionalChunks, ftsOnlyKeywordScoreByChunkKey };
    } catch (error) {
      this.logger.warn('ask_knowledge.fts_chunks_load_failed', {
        userId,
        missingFtsNoteIds,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        additionalChunks: [] as CandidateChunk[],
        ftsOnlyKeywordScoreByChunkKey: new Map<string, number>(),
      };
    }
  }

  async loadRawEvidence(
    userId: string,
    syntheses: Map<string, NoteSynthesisRecord>,
    noteMap: Map<string, NoteRecord>,
  ): Promise<Map<string, RankedCandidate[]>> {
    const result = new Map<string, RankedCandidate[]>();
    if (syntheses.size === 0) return result;

    const records = await this.noteEmbeddingRepository.getNotesEmbeddings(userId, [...syntheses.keys()]);
    for (const record of records) {
      if (record.representation !== EmbeddingRepresentation.Raw) continue;
      const note = noteMap.get(record.noteId);
      if (!note) continue;
      const entries = result.get(record.noteId) || [];
      entries.push({ chunk: { ...record, similarity: 0 }, note, hybridScore: 0 });
      result.set(record.noteId, entries);
    }
    return result;
  }

  async loadValidSyntheses(userId: string, notes: NoteRecord[]): Promise<Map<string, NoteSynthesisRecord>> {
    const result = new Map<string, NoteSynthesisRecord>();
    if (!this.synthesisRepository) return result;

    const aiNotes = notes.filter(
      (note) => note.sourceChannel === SourceChannel.AiChat || note.source === SourceChannel.AiChat,
    );
    const records = await Promise.all(
      aiNotes.map(async (note) => {
        const synthesis = await this.synthesisRepository!.getByNoteId(userId, note.id);
        const sourceHash = getAiSessionSourceHash(note.markdown);
        return synthesis?.status === NoteSynthesisStatus.Completed &&
          synthesis.sourceHash === sourceHash &&
          Boolean(synthesis.overview.trim())
          ? ([note.id, synthesis] as const)
          : null;
      }),
    );
    for (const record of records) {
      if (record) result.set(record[0], record[1]);
    }
    return result;
  }

  private scoreCandidateChunk(
    chunk: CandidateChunk,
    noteMap: Map<string, NoteRecord>,
    ftsNotesMap: Map<string, VaultNoteSummary>,
    ftsOnlyKeywordScoreByChunkKey: Map<string, number>,
  ) {
    const note = noteMap.get(chunk.noteId);
    if (!note) return null;

    const chunkKey = chunkRankKey(chunk.noteId, chunk.chunkIndex, chunk.representation);
    const ftsOnlyKeywordScore = ftsOnlyKeywordScoreByChunkKey.get(chunkKey);
    const ftsNote = ftsNotesMap.get(chunk.noteId);
    const noteKeywordScore = ftsNote?.ftsRank && ftsNote.ftsRank > 0 ? ftsNote.ftsRank : 0;

    return {
      chunk,
      note,
      vectorScore: chunk.similarity,
      keywordScore: ftsOnlyKeywordScore ?? noteKeywordScore,
      representation: chunk.representation,
      sourceRefs: chunk.sourceRefs,
    };
  }

  private logChunkScoreSummary(
    totalChunks: number,
    scoredChunks: Array<{ vectorScore: number; keywordScore: number; note: NoteRecord; chunk: CandidateChunk }>,
  ) {
    const vectorScores = scoredChunks.map((chunk) => chunk.vectorScore);
    const keywordScores = scoredChunks.map((chunk) => chunk.keywordScore);

    this.logger.info('ask_knowledge.chunks_scored', {
      totalChunks,
      scoredChunks: scoredChunks.length,
      avgVectorScore: average(vectorScores),
      maxVectorScore: scoredChunks.length > 0 ? Math.max(...vectorScores) : 0,
      minVectorScore: scoredChunks.length > 0 ? Math.min(...vectorScores) : 0,
      zeroVectorScoreCount: vectorScores.filter((score) => score === 0).length,
      avgKeywordScore: average(keywordScores),
      maxKeywordScore: scoredChunks.length > 0 ? Math.max(...keywordScores) : 0,
      minKeywordScore: scoredChunks.length > 0 ? Math.min(...keywordScores) : 0,
      zeroKeywordScoreCount: keywordScores.filter((score) => score === 0).length,
      sampleChunks: scoredChunks.slice(0, 3).map((chunk) => ({
        noteId: chunk.chunk.noteId,
        vectorScore: chunk.vectorScore,
        keywordScore: chunk.keywordScore,
        ftsRank: noteSummary(chunk.note).ftsRank,
      })),
    });

    this.logger.info('ask_knowledge.ranking_complete', {
      vectorRankedCount: scoredChunks.filter((chunk) => chunk.vectorScore > 0).length,
      keywordRankedCount: scoredChunks.filter((chunk) => chunk.keywordScore > 0).length,
    });
  }
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
