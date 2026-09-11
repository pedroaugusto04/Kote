import { Injectable } from '@nestjs/common';

import { ContentRepository } from '../../ports/notes/content.repository.js';
import type { EmbeddingConfig } from '../../ports/notes/embedding.gateway.js';
import { AppLogger } from '../../../observability/logger.js';
import { AnswerGenerationGateway } from '../../ports/query/answer-generation.gateway.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../ports/observability/runtime-environment.port.js';
import type { AskConversationTurn } from '../../../contracts/ask-conversation.js';
import { ConversationConfidence, IntegrationProvider } from '../../../contracts/enums.js';
import { AiOperationType } from '../../../domain/enums/plans.enums.js';
import { AiEntitlementService } from '../../services/ai/ai-entitlement.service.js';
import { getSpecialQueryIntent } from '../../utils/query/query.utils.js';
import { RagRetrievalService, type RagScope, type RagConfig } from '../../services/query/rag-retrieval.service.js';
import { RagContextAssemblerService, shouldUseConversationHistory, type AskContextResult } from '../../services/query/rag-context-assembler.service.js';

@Injectable()
export class AskKnowledgeUseCase {
  private readonly env: RuntimeEnvironment;

  constructor(
    private readonly ragRetrievalService: RagRetrievalService,
    private readonly ragContextAssemblerService: RagContextAssemblerService,
    private readonly contentRepository: ContentRepository,
    private readonly answerGenerationGateway: AnswerGenerationGateway,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
    private readonly aiEntitlement: AiEntitlementService,
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

    let workspaceSlug = '';
    if (options.workspaceId) {
      const workspaces = await this.contentRepository.listWorkspaces(userId);
      const ws = workspaces.find((w) => w.id === options.workspaceId);
      if (ws) {
        workspaceSlug = ws.workspaceSlug;
      }
    }
    if (!workspaceSlug) {
      const workspaces = await this.contentRepository.listWorkspaces(userId);
      workspaceSlug = workspaces.length > 0 ? workspaces[0].workspaceSlug : 'default';
    }

    await this.aiEntitlement.requireAndConsume({
      userId,
      workspaceSlug,
      provider: IntegrationProvider.AiConversation,
      operation: AiOperationType.ASK_KNOWLEDGE,
      metadata: { question, workspaceSlug },
    });

    const embeddingConfig = this.buildEmbeddingConfig();
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
      const ragConfig: RagConfig = {
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
}
