import { Injectable } from '@nestjs/common';

import { ContentRepository } from '../../ports/notes/content.repository.js';
import { EmbeddingGateway } from '../../ports/notes/embedding.gateway.js';
import { NoteEmbeddingRepository } from '../../ports/notes/note-embedding.repository.js';
import { AnswerGenerationGateway, type AnswerContextChunk } from '../../ports/query/answer-generation.gateway.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import type { NoteRecord } from '../../models/repository-records.models.js';
import type { AskConversationTurn } from '../../../contracts/ask-conversation.js';

@Injectable()
export class AskKnowledgeUseCase {
  constructor(
    private readonly embeddingGateway: EmbeddingGateway,
    private readonly noteEmbeddingRepository: NoteEmbeddingRepository,
    private readonly contentRepository: ContentRepository,
    private readonly answerGenerationGateway: AnswerGenerationGateway,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
  ) {}

  async execute(
    question: string,
    userId: string,
    options: { workspaceSlug?: string; projectSlug?: string; conversationHistory?: AskConversationTurn[] } = {},
  ) {
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

    // 1. Generate embedding for the question
    const embeddings = await this.embeddingGateway.generateEmbeddings(embeddingConfig, [queryText]);
    const questionEmbedding = embeddings[0];

    if (!questionEmbedding || questionEmbedding.length === 0) {
      return {
        ok: false,
        answer: 'Failed to generate embedding for the question.',
        confidence: 'low' as const,
        requestedAttachments: false,
        sources: [],
        relatedNotes: [],
      };
    }

    // 2. Query similar chunks (limit: 8, threshold: 0.65)
    const similarChunks = await this.noteEmbeddingRepository.findSimilar(userId, questionEmbedding, {
      limit: 8,
      workspaceSlug: options.workspaceSlug,
      projectSlug: options.projectSlug,
      minSimilarity: 0.65,
    });

    if (similarChunks.length === 0) {
      return {
        ok: true,
        answer: 'No relevant information found in the knowledge base.',
        confidence: 'low' as const,
        requestedAttachments: false,
        sources: [],
        relatedNotes: [],
      };
    }

    // 3. Fetch notes metadata to enrich chunks using optimized single query
    const noteIds = Array.from(new Set(similarChunks.map((c) => c.noteId)));
    const notes = await this.contentRepository.getNotesByIds(userId, noteIds);
    const noteMap = new Map(notes.map((n) => [n.id, n]));

    const contextChunks = similarChunks
      .map((chunk): AnswerContextChunk | null => {
        const note = noteMap.get(chunk.noteId);
        if (!note) return null;
        return {
          noteId: chunk.noteId,
          title: note.title,
          path: note.path,
          projectSlug: note.projectSlug,
          workspaceSlug: note.workspaceSlug,
          chunkText: chunk.chunkText,
        };
      })
      .filter((c): c is AnswerContextChunk => c !== null);

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
        confidence: 'low' as const,
        requestedAttachments: false,
        sources: [],
        relatedNotes: [],
      };
    }

    return {
      ok: true,
      answer: result.answer,
      confidence: result.confidence,
      requestedAttachments: result.requestedAttachments,
      requestedAttachmentPattern: result.requestedAttachmentPattern,
      sources: result.sources,
      relatedNotes: notes
        .filter((n): n is NoteRecord => !!n)
        .map((n) => ({
          id: n.id,
          title: n.title,
          path: n.path,
          projectSlug: n.projectSlug,
          workspaceSlug: n.workspaceSlug,
        })),
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
