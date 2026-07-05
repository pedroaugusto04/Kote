import { Injectable } from '@nestjs/common';

import { ContentRepository, ContentQueryRepository } from '../../ports/notes/content.repository.js';
import { EmbeddingGateway } from '../../ports/notes/embedding.gateway.js';
import { NoteEmbeddingRepository } from '../../ports/notes/note-embedding.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import { AnswerGenerationGateway, type AnswerContextChunk } from '../../ports/query/answer-generation.gateway.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../ports/observability/runtime-environment.port.js';
import type { NoteRecord } from '../../models/repository-records.models.js';
import type { AskConversationTurn } from '../../../contracts/ask-conversation.js';
import { ConversationConfidence, EmbeddingTaskType, SpecialQueryIntent } from '../../../contracts/enums.js';
import { QuotaService } from '../../services/quota.service.js';
import { AiOperationType } from '../../../domain/enums/plans.enums.js';
import { QuotaExceededException } from '../../../interfaces/http/quota-exceeded.exception.js';
import { getSpecialQueryIntent, matchesIntent, tokenizeQuery, scoreKnowledgeNote } from '../../utils/query.utils.js';
import { noteSummary } from '../../../infrastructure/mappers/content-query.mappers.js';

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

    const embeddingConfig = {
      provider: this.env.embeddingAiProvider,
      baseUrl: this.env.embeddingAiBaseUrl,
      model: this.env.embeddingAiModel,
      apiKey: this.env.embeddingAiApiKey,
    };

    const conversationHistory = shouldUseConversationHistory(question)
      ? options.conversationHistory?.slice(-5)
      : undefined;

    let queryText = question;
    if (conversationHistory && conversationHistory.length > 0) {
      const answerConfig = {
        conversationAiProvider: this.env.conversationAiProvider,
        conversationAiBaseUrl: this.env.conversationAiBaseUrl,
        conversationAiModel: this.env.conversationAiModel,
        conversationAiApiKey: this.env.conversationAiApiKey,
      };
      queryText = await this.answerGenerationGateway.rewriteQuery(answerConfig, question, conversationHistory);
      this.logger.info('ask_knowledge.query_rewrite', {
        originalQuery: question,
        rewrittenQuery: queryText,
      });
    }

    const specialIntent = getSpecialQueryIntent(question);
    this.logger.info('ask_knowledge.special_intent', {
      specialIntent,
      queryText,
    });
    
    // Resolve Context Chunks & Related Notes using strategy helper
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

    // Generate answer using AnswerGenerationGateway
    const answerConfig = {
      conversationAiProvider: this.env.conversationAiProvider,
      conversationAiBaseUrl: this.env.conversationAiBaseUrl,
      conversationAiModel: this.env.conversationAiModel,
      conversationAiApiKey: this.env.conversationAiApiKey,
    };

    const result = await this.answerGenerationGateway.generate(answerConfig, {
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

  private async resolveContext(
    userId: string,
    queryText: string,
    specialIntent: SpecialQueryIntent | null,
    options: { workspaceId?: string; projectId?: string },
    embeddingConfig: any,
  ): Promise<{ contextChunks: AnswerContextChunk[]; relatedNotes: any[] }> {
    if (specialIntent) {
      this.logger.info('ask_knowledge.special_intent_mode', { specialIntent });
      return this.resolveSpecialIntentContext(userId, specialIntent, options);
    }

    const candidateLimit = this.env.ragCandidateLimit ?? 16;
    const minSimilarity = this.env.ragMinSimilarity ?? 0.45;
    const hybridVectorWeight = this.env.ragHybridVectorWeight ?? 0.8;
    const hybridKeywordWeight = this.env.ragHybridKeywordWeight ?? 0.2;
    const topChunksLimit = this.env.ragTopChunksLimit ?? 8;

    this.logger.info('ask_knowledge.rag_config', {
      candidateLimit,
      minSimilarity,
      hybridVectorWeight,
      hybridKeywordWeight,
      topChunksLimit,
    });

    // 1. Fetch vector search candidate chunks and FTS candidate notes in parallel
    const [vectorChunks, ftsNotes] = await Promise.all([
      (async () => {
        try {
          const embeddings = await this.embeddingGateway.generateEmbeddings(embeddingConfig, [queryText], EmbeddingTaskType.Query);
          this.logger.info('ask_knowledge.embedding_generated', {
            embeddingDim: embeddings[0]?.length,
          });
          
          const questionEmbedding = embeddings[0];
          if (!questionEmbedding || questionEmbedding.length === 0) {
            this.logger.warn('ask_knowledge.embedding_empty');
            return [];
          }
          
          const results = await this.noteEmbeddingRepository.findSimilar(userId, questionEmbedding, {
            limit: candidateLimit,
            workspaceId: options.workspaceId,
            projectId: options.projectId,
            minSimilarity: minSimilarity,
          });
          this.logger.info('ask_knowledge.vector_search_complete', {
            resultCount: results.length,
            avgSimilarity: results.length > 0 ? results.reduce((sum, r) => sum + r.similarity, 0) / results.length : 0,
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
      })(),
      (async () => {
        if (!this.contentQueryRepository) return [];
        try {
          const results = await this.contentQueryRepository.list(userId, {
            projectId: options.projectId,
            workspaceId: options.workspaceId,
            query: queryText,
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
      })(),
    ]);

    this.logger.info('ask_knowledge.rag_phase1_complete', {
      vectorChunksCount: vectorChunks.length,
      ftsNotesCount: ftsNotes.length,
    });

    if (vectorChunks.length === 0 && ftsNotes.length === 0) {
      this.logger.info('ask_knowledge.no_results_phase1');
      return { contextChunks: [], relatedNotes: [] };
    }

    // 2. Resolve any missing notes from FTS notes that did not appear in vector chunks
    const existingNoteIdsInVector = new Set(vectorChunks.map((c) => c.noteId));
    const missingFtsNoteIds = ftsNotes
      .map((n) => n.id)
      .filter((id) => !existingNoteIdsInVector.has(id));

    this.logger.info('ask_knowledge.missing_fts_notes', {
      missingCount: missingFtsNoteIds.length,
      totalFtsNotes: ftsNotes.length,
    });

    let additionalChunks: any[] = [];
    if (missingFtsNoteIds.length > 0) {
      try {
        const additionalChunksList = await this.noteEmbeddingRepository.getNotesEmbeddings(userId, missingFtsNoteIds);
        this.logger.info('ask_knowledge.fts_embeddings_fetched', {
          requestedIds: missingFtsNoteIds.length,
          fetchedChunks: additionalChunksList.length,
        });
        additionalChunks = additionalChunksList.map((c) => ({
          ...c,
          similarity: 0.0, // baseline vector similarity for pure keyword matches
        }));
      } catch (error) {
        this.logger.warn('ask_knowledge.fts_chunks_load_failed', {
          userId,
          missingFtsNoteIds,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('ask_knowledge.rag_phase2_complete', {
      additionalChunksCount: additionalChunks.length,
    });

    // Combine chunks
    const allChunks = [...vectorChunks, ...additionalChunks];
    if (allChunks.length === 0) {
      this.logger.info('ask_knowledge.no_chunks_after_phase2');
      return { contextChunks: [], relatedNotes: [] };
    }

    // 3. Fetch all referenced notes to calculate keyword scores
    const noteIds = Array.from(new Set(allChunks.map((c) => c.noteId)));
    const notes = await this.contentRepository.getNotesByIds(userId, noteIds);
    this.logger.info('ask_knowledge.notes_fetched', {
      requestedIds: noteIds.length,
      fetchedNotes: notes.length,
    });
    
    const noteMap = new Map(notes.map((n) => [n.id, n]));
    const tokens = tokenizeQuery(queryText);

    const scoredChunks = allChunks
      .map((chunk) => {
        const note = noteMap.get(chunk.noteId);
        if (!note) return null;
        const vectorScore = chunk.similarity;
        const noteSummaryData = noteSummary(note);
        
        // Calculate chunk-specific keyword match score
        const chunkTextLower = (chunk.chunkText || '').toLowerCase();
        let chunkKeywordScore = 0;
        for (const token of tokens) {
          if (chunkTextLower.includes(token)) {
            chunkKeywordScore += 10;
          }
        }

        // Get global note-level keyword score
        const noteScore = (noteSummaryData.ftsRank !== undefined && noteSummaryData.ftsRank > 0)
          ? noteSummaryData.ftsRank
          : scoreKnowledgeNote(noteSummaryData, tokens);

        // Combine chunk-specific matches with note-level context as a bonus
        const keywordScore = chunkKeywordScore + (noteScore * 0.1);

        return { chunk, note, vectorScore, keywordScore };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    this.logger.info('ask_knowledge.chunks_scored', {
      totalChunks: allChunks.length,
      scoredChunks: scoredChunks.length,
      avgVectorScore: scoredChunks.length > 0 ? scoredChunks.reduce((sum, sc) => sum + sc.vectorScore, 0) / scoredChunks.length : 0,
      avgKeywordScore: scoredChunks.length > 0 ? scoredChunks.reduce((sum, sc) => sum + sc.keywordScore, 0) / scoredChunks.length : 0,
    });

    // 4. Rank by Vector Similarity (descending)
    const vectorRanked = [...scoredChunks]
      .filter((sc) => sc.vectorScore > 0)
      .sort((a, b) => {
        if (b.vectorScore !== a.vectorScore) return b.vectorScore - a.vectorScore;
        const aKey = `${a.chunk.noteId}_${a.chunk.chunkIndex}`;
        const bKey = `${b.chunk.noteId}_${b.chunk.chunkIndex}`;
        return aKey.localeCompare(bKey);
      });

    const vectorRankMap = new Map<string, number>();
    vectorRanked.forEach((sc, index) => {
      const key = `${sc.chunk.noteId}_${sc.chunk.chunkIndex}`;
      vectorRankMap.set(key, index + 1);
    });

    // 5. Rank by Keyword Score (descending)
    const keywordRanked = [...scoredChunks]
      .filter((sc) => sc.keywordScore > 0)
      .sort((a, b) => {
        if (b.keywordScore !== a.keywordScore) return b.keywordScore - a.keywordScore;
        const aKey = `${a.chunk.noteId}_${a.chunk.chunkIndex}`;
        const bKey = `${b.chunk.noteId}_${b.chunk.chunkIndex}`;
        return aKey.localeCompare(bKey);
      });

    const keywordRankMap = new Map<string, number>();
    keywordRanked.forEach((sc, index) => {
      const key = `${sc.chunk.noteId}_${sc.chunk.chunkIndex}`;
      keywordRankMap.set(key, index + 1);
    });

    this.logger.info('ask_knowledge.ranking_complete', {
      vectorRankedCount: vectorRanked.length,
      keywordRankedCount: keywordRanked.length,
    });

    // 6. Perform RRF (Reciprocal Rank Fusion)
    const k = this.env.ragRrfK ?? 20;
    const rankedChunks = scoredChunks
      .map((sc) => {
        const key = `${sc.chunk.noteId}_${sc.chunk.chunkIndex}`;
        const vectorRank = vectorRankMap.get(key);
        const keywordRank = keywordRankMap.get(key);

        const rrfVector = vectorRank ? hybridVectorWeight / (k + vectorRank) : 0;
        const rrfKeyword = keywordRank ? hybridKeywordWeight / (k + keywordRank) : 0;
        const hybridScore = rrfVector + rrfKeyword;

        return { chunk: sc.chunk, note: sc.note, hybridScore };
      })
      .filter((item) => item.hybridScore > 0)
      .sort((left, right) => right.hybridScore - left.hybridScore)
      .slice(0, topChunksLimit);

    this.logger.info('ask_knowledge.rrf_complete', {
      k,
      rrfK: k,
      topChunksLimit,
      rankedChunksCount: rankedChunks.length,
      avgHybridScore: rankedChunks.length > 0 ? rankedChunks.reduce((sum, r) => sum + r.hybridScore, 0) / rankedChunks.length : 0,
    });

    const contextChunks = rankedChunks.map(({ chunk, note }) => ({
      noteId: chunk.noteId,
      title: note.title,
      path: note.path,
      projectSlug: note.projectSlug,
      workspaceId: note.workspaceId,
      chunkText: chunk.chunkText,
    }));

    const topNotes = Array.from(new Set(rankedChunks.map((r) => r.note.id)))
      .map((id) => noteMap.get(id)!)
      .filter(Boolean);

    const relatedNotes = topNotes.map((n) => ({
      id: n.id,
      title: n.title,
      path: n.path,
      projectSlug: n.projectSlug || '',
      workspaceId: n.workspaceId,
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
    options: { workspaceId?: string; projectId?: string }
  ): Promise<{ contextChunks: AnswerContextChunk[]; relatedNotes: any[] }> {
    const allNotes = await this.contentRepository.listNotes(userId, {
      projectId: options.projectId,
      workspaceId: options.workspaceId,
    });
    const noteMap = new Map(allNotes.map((n) => [n.id, n]));
    let vaultNotes = allNotes.map((n) => noteSummary(n));

    vaultNotes = vaultNotes.filter((n) => matchesIntent(n, specialIntent));

    // Sort by occurredAt/date descending
    vaultNotes.sort((left, right) => {
      const leftTime = new Date(left.date || 0).getTime();
      const rightTime = new Date(right.date || 0).getTime();
      return rightTime - leftTime;
    });

    const topChunksLimit = this.env.ragTopChunksLimit ?? 8;
    const selectedNotes = vaultNotes.slice(0, topChunksLimit);

    const contextChunks = selectedNotes.map((vn) => {
      const original = noteMap.get(vn.id)!;
      return {
        noteId: vn.id,
        title: vn.title,
        path: vn.path,
        projectSlug: vn.project,
        workspaceId: original.workspaceId,
        chunkText: original.markdown || original.summary || '',
      };
    });

    const relatedNotes = selectedNotes.map((vn) => {
      const original = noteMap.get(vn.id)!;
      return {
        id: vn.id,
        title: vn.title,
        path: vn.path,
        projectSlug: vn.project,
        workspaceId: original.workspaceId,
      };
    });

    return { contextChunks, relatedNotes };
  }
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
