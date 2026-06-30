import { Injectable } from '@nestjs/common';

import { ContentRepository } from '../../ports/notes/content.repository.js';
import { EmbeddingGateway } from '../../ports/notes/embedding.gateway.js';
import { NoteEmbeddingRepository } from '../../ports/notes/note-embedding.repository.js';
import { AnswerGenerationGateway, type AnswerContextChunk } from '../../ports/query/answer-generation.gateway.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import type { NoteRecord } from '../../models/repository-records.models.js';
import type { AskConversationTurn } from '../../../contracts/ask-conversation.js';
import { ConversationConfidence } from '../../../contracts/enums.js';
import { QuotaService } from '../../services/quota.service.js';
import { AiOperationType } from '../../../domain/enums/plans.enums.js';
import { QuotaExceededException } from '../../../interfaces/http/quota-exceeded.exception.js';
import { getSpecialQueryIntent, matchesIntent, tokenizeQuery, scoreKnowledgeNote } from '../../utils/query.utils.js';
import { noteSummary } from '../../../infrastructure/mappers/content-query.mappers.js';

@Injectable()
export class AskKnowledgeUseCase {
  constructor(
    private readonly embeddingGateway: EmbeddingGateway,
    private readonly noteEmbeddingRepository: NoteEmbeddingRepository,
    private readonly contentRepository: ContentRepository,
    private readonly answerGenerationGateway: AnswerGenerationGateway,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly quotaService: QuotaService,
  ) {}

  async execute(
    question: string,
    userId: string,
    options: { workspaceId?: string; projectId?: string; conversationHistory?: AskConversationTurn[] } = {},
  ) {
    const quotaResult = await this.quotaService.checkAndIncrementAiUsage(userId, AiOperationType.ASK_KNOWLEDGE);
    if (!quotaResult.allowed) {
      throw new QuotaExceededException('ai_credits', quotaResult.limit, quotaResult.current);
    }

    const env = this.runtimeEnv.read();
    const embeddingConfig = {
      provider: env.embeddingAiProvider,
      baseUrl: env.embeddingAiBaseUrl,
      model: env.embeddingAiModel,
      apiKey: env.embeddingAiApiKey,
    };

    const conversationHistory = shouldUseConversationHistory(question)
      ? options.conversationHistory?.slice(-5)
      : undefined;

    let queryText = question;
    if (conversationHistory && conversationHistory.length > 0) {
      const answerConfig = {
        conversationAiProvider: env.conversationAiProvider,
        conversationAiBaseUrl: env.conversationAiBaseUrl,
        conversationAiModel: env.conversationAiModel,
        conversationAiApiKey: env.conversationAiApiKey,
      };
      queryText = await this.answerGenerationGateway.rewriteQuery(answerConfig, question, conversationHistory);
    }

    const specialIntent = getSpecialQueryIntent(question);
    let contextChunks: AnswerContextChunk[] = [];
    let relatedNotesForResponse: { id: string; title: string; path: string; projectSlug: string; workspaceId: string }[] = [];

    if (specialIntent) {
      const allNotes = await this.contentRepository.listNotes(userId);
      const noteMap = new Map(allNotes.map((n) => [n.id, n]));
      let vaultNotes = allNotes.map((n) => noteSummary(n));

      if (options.projectId) {
        vaultNotes = vaultNotes.filter((n) => noteMap.get(n.id)?.projectId === options.projectId);
      }
      if (options.workspaceId) {
        vaultNotes = vaultNotes.filter((n) => noteMap.get(n.id)?.workspaceId === options.workspaceId);
      }

      vaultNotes = vaultNotes.filter((n) => matchesIntent(n, specialIntent));

      // Sort by occurredAt/date descending
      vaultNotes.sort((left, right) => {
        const leftTime = new Date(left.date || 0).getTime();
        const rightTime = new Date(right.date || 0).getTime();
        return rightTime - leftTime;
      });

      const selectedNotes = vaultNotes.slice(0, 8);

      if (selectedNotes.length === 0) {
        return {
          ok: true,
          answer: 'No relevant information found in your Kote.',
          confidence: ConversationConfidence.Low,
          requestedAttachments: false,
          sources: [],
          relatedNotes: [],
        };
      }

      contextChunks = selectedNotes.map((vn) => {
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

      relatedNotesForResponse = selectedNotes.map((vn) => {
        const original = noteMap.get(vn.id)!;
        return {
          id: vn.id,
          title: vn.title,
          path: vn.path,
          projectSlug: vn.project,
          workspaceId: original.workspaceId,
        };
      });
    } else {
      // 1. Generate embedding for the question
      const embeddings = await this.embeddingGateway.generateEmbeddings(embeddingConfig, [queryText]);
      const questionEmbedding = embeddings[0];

      if (!questionEmbedding || questionEmbedding.length === 0) {
        return {
          ok: false,
          answer: 'Failed to generate embedding for the question.',
          confidence: ConversationConfidence.Low,
          requestedAttachments: false,
          sources: [],
          relatedNotes: [],
        };
      }

      // 2. Query similar chunks with broader candidate limit and lower threshold for hybrid re-ranking
      const similarChunks = await this.noteEmbeddingRepository.findSimilar(userId, questionEmbedding, {
        limit: 16,
        workspaceId: options.workspaceId,
        projectId: options.projectId,
        minSimilarity: 0.35,
      });

      if (similarChunks.length === 0) {
        return {
          ok: true,
          answer: 'No relevant information found in your Kote.',
          confidence: ConversationConfidence.Low,
          requestedAttachments: false,
          sources: [],
          relatedNotes: [],
        };
      }

      // 3. Fetch notes metadata to enrich chunks and perform semantic-heavy (0.8 vector / 0.2 keyword) hybrid re-ranking
      const noteIds = Array.from(new Set(similarChunks.map((c) => c.noteId)));
      const notes = await this.contentRepository.getNotesByIds(userId, noteIds);
      const noteMap = new Map(notes.map((n) => [n.id, n]));
      const tokens = tokenizeQuery(queryText);

      const rankedChunks = similarChunks
        .map((chunk) => {
          const note = noteMap.get(chunk.noteId);
          if (!note) return null;
          const vectorScore = chunk.similarity * 100;
          const rawKeywordScore = scoreKnowledgeNote(noteSummary(note), tokens);
          const keywordScore = Math.min(100, rawKeywordScore);
          const hybridScore = (vectorScore * 0.8) + (keywordScore * 0.2);
          return { chunk, note, hybridScore };
        })
        .filter((item): item is { chunk: typeof similarChunks[0]; note: NoteRecord; hybridScore: number } => item !== null)
        .sort((left, right) => right.hybridScore - left.hybridScore)
        .slice(0, 8);

      contextChunks = rankedChunks.map(({ chunk, note }) => ({
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

      relatedNotesForResponse = topNotes.map((n) => ({
        id: n.id,
        title: n.title,
        path: n.path,
        projectSlug: n.projectSlug || '',
        workspaceId: n.workspaceId,
      }));
    }

    // 4. Generate answer using AnswerGenerationGateway
    const answerConfig = {
      conversationAiProvider: env.conversationAiProvider,
      conversationAiBaseUrl: env.conversationAiBaseUrl,
      conversationAiModel: env.conversationAiModel,
      conversationAiApiKey: env.conversationAiApiKey,
    };

    const result = await this.answerGenerationGateway.generate(answerConfig, {
      question,
      context: contextChunks,
      conversationHistory,
    });

    if (!result) {
      return {
        ok: false,
        answer: 'Failed to generate an answer from the AI model.',
        confidence: ConversationConfidence.Low,
        requestedAttachments: false,
        sources: [],
        relatedNotes: [],
      };
    }

    // Credits already recorded by checkAndIncrementAiUsage at the start of this use case.

    return {
      ok: true,
      answer: result.answer,
      confidence: result.confidence,
      requestedAttachments: result.requestedAttachments,
      requestedAttachmentPattern: result.requestedAttachmentPattern,
      sources: result.sources,
      relatedNotes: relatedNotesForResponse,
    };
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
