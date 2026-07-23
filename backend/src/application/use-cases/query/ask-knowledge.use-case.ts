import { Injectable } from '@nestjs/common';

import { ContentRepository, ContentQueryRepository } from '../../ports/notes/content.repository.js';
import { EmbeddingGateway, type EmbeddingConfig } from '../../ports/notes/embedding.gateway.js';
import { NoteEmbeddingRepository } from '../../ports/notes/note-embedding.repository.js';
import type { SimilarChunk } from '../../ports/notes/note-embedding.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import { AnswerGenerationGateway, type AnswerContextChunk } from '../../ports/query/answer-generation.gateway.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../ports/observability/runtime-environment.port.js';
import type { NoteRecord } from '../../models/repository-records.models.js';
import type { VaultNoteSummary } from '../../models/vault-note.models.js';
import type { AskConversationTurn } from '../../../contracts/ask-conversation.js';
import { ConversationConfidence, EmbeddingTaskType, SpecialQueryIntent } from '../../../contracts/enums.js';
import { QuotaService } from '../../services/quota/quota.service.js';
import { AiOperationType } from '../../../domain/enums/plans.enums.js';
import { QuotaExceededException } from '../../../interfaces/http/quota-exceeded.exception.js';
import { getSpecialQueryIntent, matchesIntent, selectTopFtsOnlyChunksPerNote } from '../../utils/query/query.utils.js';
import { chunkRankKey, rankHybridContextChunks } from '../../utils/rag/hybrid-rag.utils.js';
import { noteSummary } from '../../../infrastructure/mappers/content-query.mappers.js';

type AskRelatedNote = {
  id: string;
  title: string;
  path: string;
  projectSlug: string;
  workspaceId: string;
};

type AskContextResult = {
  contextChunks: AnswerContextChunk[];
  relatedNotes: AskRelatedNote[];
};

type CandidateChunk = {
  noteId: string;
  chunkIndex: number;
  chunkText: string;
  similarity: number;
};

type AskScope = {
  workspaceId?: string;
  projectId?: string;
};

@Injectable()
export class AskKnowledgeUseCase {
  private readonly env: RuntimeEnvironment;

  constructor(
    private readonly embeddingGateway: EmbeddingGateway,
    private readonly noteEmbeddingRepository: NoteEmbeddingRepository,
    private readonly contentRepository: ContentRepository,
    private readonly answerGenerationGateway: AnswerGenerationGateway,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly quotaService: QuotaService,
    private readonly contentQueryRepository: ContentQueryRepository,
    private readonly logger: AppLogger,
  ) {
    this.env = this.runtimeEnv.read();
  }

  async execute(
    question: string,
    userId: string,
    options: { workspaceId?: string; projectId?: string; conversationHistory?: AskConversationTurn[] } = {},
  ) {
    this.logger.info('ask_knowledge.start', {
      userId,
      question,
      workspaceId: options.workspaceId,
      projectId: options.projectId,
      hasConversationHistory: Boolean(options.conversationHistory?.length),
    });

    const quotaResult = await this.quotaService.checkAndIncrementAiUsage(userId, AiOperationType.ASK_KNOWLEDGE);
    if (!quotaResult.allowed) {
      throw new QuotaExceededException('ai_credits', quotaResult.limit, quotaResult.current);
    }

    const embeddingConfig = this.buildEmbeddingConfig();
    const conversationHistory = shouldUseConversationHistory(question)
      ? options.conversationHistory?.slice(-5)
      : undefined;

    const queryText = await this.resolveQueryText(question, conversationHistory);
    const specialIntent = getSpecialQueryIntent(question);
    this.logger.info('ask_knowledge.special_intent', { specialIntent, queryText });

    const { contextChunks, relatedNotes } = await this.resolveContext(
      userId,
      queryText,
      specialIntent,
      options,
      embeddingConfig,
    );

    this.logger.info('ask_knowledge.context_resolved', {
      contextChunksCount: contextChunks.length,
      relatedNotesCount: relatedNotes.length,
    });

    if (contextChunks.length === 0) {
      this.logger.info('ask_knowledge.no_context');
      return {
        ok: true,
        answer: 'No relevant information found in your Kote.',
        confidence: ConversationConfidence.Low,
        requestedAttachments: false,
        sources: [],
        relatedNotes: [],
      };
    }

    const result = await this.answerGenerationGateway.generate(this.buildConversationAiConfig(), {
      question,
      context: contextChunks,
      conversationHistory,
    });
    this.logger.info('ask_knowledge.answer_generated', {
      confidence: result?.confidence,
    });

    if (!result) {
      this.logger.info('ask_knowledge.generation_failed');
      return {
        ok: false,
        answer: 'Failed to generate an answer from the AI model.',
        confidence: ConversationConfidence.Low,
        requestedAttachments: false,
        sources: [],
        relatedNotes: [],
      };
    }

    this.logger.info('ask_knowledge.complete', {
      confidence: result.confidence,
      contextChunksCount: contextChunks.length,
      relatedNotesCount: relatedNotes.length,
      requestedAttachments: result.requestedAttachments
    });

    return {
      ok: true,
      answer: result.answer,
      confidence: result.confidence,
      requestedAttachments: result.requestedAttachments,
      requestedAttachmentPattern: result.requestedAttachmentPattern,
      sources: result.sources,
      relatedNotes,
    };
  }

  private buildEmbeddingConfig(): EmbeddingConfig {
    return {
      provider: this.env.embeddingAiProvider,
      baseUrl: this.env.embeddingAiBaseUrl,
      model: this.env.embeddingAiModel,
      apiKey: this.env.embeddingAiApiKey,
    };
  }

  private buildConversationAiConfig() {
    return {
      conversationAiProvider: this.env.conversationAiProvider,
      conversationAiBaseUrl: this.env.conversationAiBaseUrl,
      conversationAiModel: this.env.conversationAiModel,
      conversationAiApiKey: this.env.conversationAiApiKey,
    };
  }

  private async resolveQueryText(question: string, conversationHistory?: AskConversationTurn[]) {
    if (!conversationHistory?.length) {
      return question;
    }

    const queryText = await this.answerGenerationGateway.rewriteQuery(
      this.buildConversationAiConfig(),
      question,
      conversationHistory,
    );
    this.logger.info('ask_knowledge.query_rewrite', {
      originalQuery: question,
      rewrittenQuery: queryText,
    });
    return queryText;
  }

  private async resolveContext(
    userId: string,
    queryText: string,
    specialIntent: SpecialQueryIntent | null,
    options: AskScope,
    embeddingConfig: EmbeddingConfig,
  ): Promise<AskContextResult> {
    if (specialIntent) {
      this.logger.info('ask_knowledge.special_intent_mode', { specialIntent });
      return this.resolveSpecialIntentContext(userId, specialIntent, options);
    }

    return this.resolveHybridContext(userId, queryText, options, embeddingConfig);
  }

  private async resolveHybridContext(
    userId: string,
    queryText: string,
    options: AskScope,
    embeddingConfig: EmbeddingConfig,
  ): Promise<AskContextResult> {
    const ragConfig = {
      candidateLimit: this.env.ragCandidateLimit ?? 16,
      minSimilarity: this.env.ragMinSimilarity ?? 0.45,
      hybridVectorWeight: this.env.ragHybridVectorWeight ?? 0.7,
      hybridKeywordWeight: this.env.ragHybridKeywordWeight ?? 0.3,
      topChunksLimit: this.env.ragTopChunksLimit ?? 10,
      rrfK: this.env.ragRrfK ?? 20,
      recencyBonusEnabled: this.env.ragRecencyBonusEnabled ?? true,
      recencyMaxBonus: this.env.ragRecencyMaxBonus ?? 0.008,
      recencyMaxBonusDays: this.env.ragRecencyMaxBonusDays ?? 180,
    };

    this.logger.info('ask_knowledge.rag_config', ragConfig);

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
      return emptyAskContext();
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
      return emptyAskContext();
    }

    const noteIds = Array.from(new Set(allChunks.map((chunk) => chunk.noteId)));
    const notes = await this.contentRepository.getNotesByIds(userId, noteIds);
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
      avgHybridScore: rankedChunks.length > 0
        ? rankedChunks.reduce((sum, result) => sum + result.hybridScore, 0) / rankedChunks.length
        : 0,
    });

    return this.buildAskContextResult(rankedChunks, noteMap);
  }

  private async searchVectorCandidateChunks(
    userId: string,
    queryText: string,
    options: AskScope,
    embeddingConfig: EmbeddingConfig,
    ragConfig: { candidateLimit: number; minSimilarity: number },
  ): Promise<SimilarChunk[]> {
    try {
      const embeddings = await this.embeddingGateway.generateEmbeddings(
        embeddingConfig,
        [queryText],
        EmbeddingTaskType.Query,
      );
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

      const results = await this.noteEmbeddingRepository.findSimilar(userId, questionEmbedding, {
        limit: ragConfig.candidateLimit,
        workspaceId: options.workspaceId,
        projectId: options.projectId,
        minSimilarity: ragConfig.minSimilarity,
      });

      this.logger.info('ask_knowledge.vector_search_complete', {
        resultCount: results.length,
        avgSimilarity: results.length > 0
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

  private async searchFtsCandidateNotes(
    userId: string,
    queryText: string,
    options: AskScope,
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

  private async loadFtsOnlyChunks(
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
        ftsOnlyKeywordScoreByChunkKey.set(chunkRankKey(chunk.noteId, chunk.chunkIndex), keywordScore);
        return {
          noteId: chunk.noteId,
          chunkIndex: chunk.chunkIndex,
          chunkText: chunk.chunkText,
          similarity: 0,
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

  private scoreCandidateChunk(
    chunk: CandidateChunk,
    noteMap: Map<string, NoteRecord>,
    ftsNotesMap: Map<string, VaultNoteSummary>,
    ftsOnlyKeywordScoreByChunkKey: Map<string, number>,
  ) {
    const note = noteMap.get(chunk.noteId);
    if (!note) return null;

    const chunkKey = chunkRankKey(chunk.noteId, chunk.chunkIndex);
    const ftsOnlyKeywordScore = ftsOnlyKeywordScoreByChunkKey.get(chunkKey);
    const ftsNote = ftsNotesMap.get(chunk.noteId);
    const noteKeywordScore = ftsNote?.ftsRank && ftsNote.ftsRank > 0 ? ftsNote.ftsRank : 0;

    return {
      chunk,
      note,
      vectorScore: chunk.similarity,
      keywordScore: ftsOnlyKeywordScore ?? noteKeywordScore,
    };
  }

  private logChunkScoreSummary(totalChunks: number, scoredChunks: Array<{ vectorScore: number; keywordScore: number; note: NoteRecord; chunk: CandidateChunk }>) {
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

  private buildAskContextResult(
    rankedChunks: Array<{ chunk: CandidateChunk; note: NoteRecord; hybridScore: number }>,
    noteMap: Map<string, NoteRecord>,
  ): AskContextResult {
    const contextChunks = rankedChunks.map(({ chunk, note }) => ({
      noteId: chunk.noteId,
      title: note.title,
      path: note.path,
      projectSlug: note.projectSlug,
      workspaceId: note.workspaceId,
      chunkText: chunk.chunkText,
    }));

    const topNoteIds = Array.from(new Set(rankedChunks.map((result) => result.note.id)));
    const relatedNotes = topNoteIds
      .map((noteId) => noteMap.get(noteId))
      .filter((note): note is NoteRecord => Boolean(note))
      .map((note) => ({
        id: note.id,
        title: note.title,
        path: note.path,
        projectSlug: note.projectSlug || '',
        workspaceId: note.workspaceId,
      }));

    this.logger.info('ask_knowledge.context_built', {
      contextChunksCount: contextChunks.length,
      relatedNotesCount: relatedNotes.length,
    });

    return { contextChunks, relatedNotes };
  }

  private async resolveSpecialIntentContext(
    userId: string,
    specialIntent: SpecialQueryIntent,
    options: AskScope,
  ): Promise<AskContextResult> {
    const allNotes = await this.contentRepository.listNotes(userId, {
      projectId: options.projectId,
      workspaceId: options.workspaceId,
    });
    const noteMap = new Map(allNotes.map((note) => [note.id, note]));

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const matchingNotes = allNotes
      .map((note) => noteSummary(note))
      .filter((note) => {
        if (!matchesIntent(note, specialIntent)) {
          return false;
        }
        if (specialIntent === SpecialQueryIntent.Recent) {
          const noteDate = new Date(note.date || 0);
          return noteDate >= thirtyDaysAgo;
        }
        return true;
      })
      .sort((left, right) => {
        const leftTime = new Date(left.date || 0).getTime();
        const rightTime = new Date(right.date || 0).getTime();
        return rightTime - leftTime;
      });

    const topChunksLimit = this.env.ragTopChunksLimit ?? 10;
    const selectedNotes = matchingNotes.slice(0, topChunksLimit);

    const contextChunks = selectedNotes.map((summary) => {
      const note = noteMap.get(summary.id)!;
      return {
        noteId: summary.id,
        title: summary.title,
        path: summary.path,
        projectSlug: summary.project,
        workspaceId: note.workspaceId,
        chunkText: note.markdown || note.summary || '',
      };
    });

    const relatedNotes = selectedNotes.map((summary) => {
      const note = noteMap.get(summary.id)!;
      return {
        id: summary.id,
        title: summary.title,
        path: summary.path,
        projectSlug: summary.project,
        workspaceId: note.workspaceId,
      };
    });

    return { contextChunks, relatedNotes };
  }
}

function emptyAskContext(): AskContextResult {
  return { contextChunks: [], relatedNotes: [] };
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function shouldUseConversationHistory(question: string): boolean {
  const normalized = normalizeQuestion(question);
  if (!normalized) return false;

  return contextualQuestionPatterns.some((pattern) => pattern.test(normalized));
}

function normalizeQuestion(question: string): string {
  return question
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const contextualQuestionPatterns = [
  /^(e|and|also|tambem|agora|then|so|mas|but)\b/,
  /\b(isso|isto|esse|essa|esses|essas|este|esta|estes|estas|aquele|aquela|aquilo)\b/,
  /\b(ele|ela|eles|elas|dele|dela|deles|delas|nele|nela|nisso|nessa|nesse)\b/,
  /\b(it|that|this|these|those|they|them|he|she|him|her|its|their)\b/,
  /\b(previous|above|last|earlier|anterior|ultimo|ultima)\b/,
  /\b(o arquivo|a nota|o documento|the file|the note|the document)\b/,
];
