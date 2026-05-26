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

    // 1. Generate embedding for the question
    const embeddings = await this.embeddingGateway.generateEmbeddings(embeddingConfig, [question]);
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

    // 2. Query similar chunks (limit: 8)
    const similarChunks = await this.noteEmbeddingRepository.findSimilar(userId, questionEmbedding, {
      limit: 8,
      workspaceSlug: options.workspaceSlug,
      projectSlug: options.projectSlug,
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

    // 3. Fetch notes metadata to enrich chunks
    const noteIds = Array.from(new Set(similarChunks.map((c) => c.noteId)));
    const notes = await Promise.all(noteIds.map((id) => this.contentRepository.getNoteById(userId, id)));
    const noteMap = new Map(notes.filter((n): n is NoteRecord => !!n).map((n) => [n.id, n]));

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
      conversationHistory: options.conversationHistory,
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
