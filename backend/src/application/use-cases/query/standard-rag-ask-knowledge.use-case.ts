import { Injectable } from '@nestjs/common';

import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import { AnswerGenerationGateway, type AnswerGenerationResponse } from '../../ports/query/answer-generation.gateway.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../ports/observability/runtime-environment.port.js';
import type { AskConversationTurn } from '../../../contracts/ask-conversation.js';
import { ConversationConfidence, IntegrationProvider } from '../../../contracts/enums.js';
import { AiOperationType } from '../../../domain/enums/plans.enums.js';
import { AiEntitlementService } from '../../services/ai/ai-entitlement.service.js';
import { getSpecialQueryIntent } from '../../utils/query/query.utils.js';
import { RagRetrievalService } from '../../services/query/rag-retrieval.service.js';
import { RagContextAssemblerService, shouldUseConversationHistory, type AskContextResult } from '../../services/query/rag-context-assembler.service.js';
import { AskKnowledgeUseCase, type AskKnowledgeOptions, type AskKnowledgeResult } from './ask-knowledge.use-case.js';
import {
  AI_UNAVAILABLE_FALLBACK_ANSWER,
  resolveConversationAiConfig,
  resolveEmbeddingConfig,
  resolveRagConfig,
} from '../../utils/query/query-config.utils.js';

@Injectable()
export class StandardRagAskKnowledgeUseCase extends AskKnowledgeUseCase {
  constructor(
    private readonly ragRetrievalService: RagRetrievalService,
    private readonly ragContextAssemblerService: RagContextAssemblerService,
    private readonly contentRepository: ContentRepository,
    private readonly answerGenerationGateway: AnswerGenerationGateway,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
    private readonly aiEntitlement: AiEntitlementService,
  ) {
    super();
  }

  private get env(): RuntimeEnvironment {
    return this.runtimeEnv.read();
  }

  async execute(
    question: string,
    userId: string,
    options: AskKnowledgeOptions = {},
  ): Promise<AskKnowledgeResult> {
    this.logger.info('ask_knowledge.standard_rag.start', {
      userId,
      question,
      workspaceId: options.workspaceId,
      projectId: options.projectId,
      hasConversationHistory: Boolean(options.conversationHistory?.length),
    });

    const workspaces = await this.contentRepository.listWorkspaces(userId);
    const workspaceSlug = this.resolveWorkspaceSlug(workspaces, options.workspaceId);

    await this.aiEntitlement.requireAndConsume({
      userId,
      workspaceSlug,
      provider: IntegrationProvider.AiConversation,
      operation: AiOperationType.ASK_KNOWLEDGE,
      metadata: { question, workspaceSlug },
    });

    const embeddingConfig = resolveEmbeddingConfig(this.env);
    const conversationHistory = shouldUseConversationHistory(question)
      ? options.conversationHistory?.slice(-5)
      : undefined;

    const queryText = await this.resolveQueryText(question, conversationHistory);
    const specialIntent = getSpecialQueryIntent(question);
    this.logger.info('ask_knowledge.special_intent', { specialIntent, queryText });

    let contextResult: AskContextResult;
    if (specialIntent) {
      this.logger.info('ask_knowledge.special_intent_mode', { specialIntent });
      const topChunksLimit = this.env.ragTopChunksLimit ?? 10;
      contextResult = await this.ragContextAssemblerService.resolveSpecialIntentContext(
        userId,
        specialIntent,
        options,
        topChunksLimit,
      );
    } else {
      const ragConfig = resolveRagConfig(this.env);

      const retrieval = await this.ragRetrievalService.retrieveHybridChunks(
        userId,
        queryText,
        options,
        embeddingConfig,
        ragConfig,
      );

      if (retrieval.rankedChunks.length === 0) {
        contextResult = { contextChunks: [], relatedNotes: [] };
      } else {
        contextResult = await this.ragContextAssemblerService.buildAskContextResult(
          userId,
          retrieval.rankedChunks,
          retrieval.noteMap,
          retrieval.validSyntheses,
        );
      }
    }

    const { contextChunks, relatedNotes } = contextResult;

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

    let result: AnswerGenerationResponse | null = null;
    try {
      result = await this.answerGenerationGateway.generate(resolveConversationAiConfig(this.env), {
        question,
        context: contextChunks,
        conversationHistory,
      });
    } catch (error) {
      const err = error as Record<string, unknown>;
      this.logger.error('ask_knowledge.generation_error', {
        cause: error instanceof Error ? error.message : String(error),
        provider: err.provider ?? this.env.conversationAiProvider,
        model: err.model ?? this.env.conversationAiModel,
        endpoint: err.endpoint,
        status: err.status,
        statusText: err.statusText,
        responseBody: err.responseBody,
      });
    }

    if (!result) {
      this.logger.warn('ask_knowledge.generation_failed', {
        provider: this.env.conversationAiProvider,
        model: this.env.conversationAiModel,
        hasApiKey: Boolean(this.env.conversationAiApiKey),
      });
      return {
        ok: true,
        answer: AI_UNAVAILABLE_FALLBACK_ANSWER,
        confidence: ConversationConfidence.Low,
        requestedAttachments: false,
        sources: [],
        relatedNotes,
      };
    }

    this.logger.info('ask_knowledge.complete', {
      confidence: result.confidence,
      contextChunksCount: contextChunks.length,
      relatedNotesCount: relatedNotes.length,
      requestedAttachments: result.requestedAttachments,
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

  private async resolveQueryText(question: string, conversationHistory?: AskConversationTurn[]) {
    if (!conversationHistory?.length) {
      return question;
    }

    const queryText = await this.answerGenerationGateway.rewriteQuery(
      resolveConversationAiConfig(this.env),
      question,
      conversationHistory,
    );
    this.logger.info('ask_knowledge.query_rewrite', {
      originalQuery: question,
      rewrittenQuery: queryText,
    });
    return queryText;
  }
}
