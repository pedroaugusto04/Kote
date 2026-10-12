import { Injectable } from '@nestjs/common';

import { ContentRepository } from '../../ports/notes/content.repository.js';
import type { EmbeddingConfig } from '../../ports/notes/embedding.gateway.js';
import { AppLogger } from '../../../observability/logger.js';
import { AskAgentGateway } from '../../ports/query/ask-agent.gateway.js';
import type { AnswerGenerationResponse } from '../../ports/query/answer-generation.gateway.js';
import { AskAgentToolsService, AgentContextTracker } from '../../services/query/ask-agent-tools.service.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../ports/observability/runtime-environment.port.js';
import { ConversationConfidence, IntegrationProvider } from '../../../contracts/enums.js';
import { AiOperationType } from '../../../domain/enums/plans.enums.js';
import { AiEntitlementService } from '../../services/ai/ai-entitlement.service.js';
import type { RagConfig } from '../../services/query/rag-retrieval.service.js';
import { AskKnowledgeUseCase, type AskKnowledgeOptions, type AskKnowledgeResult } from './ask-knowledge.use-case.js';

@Injectable()
export class AgentAskKnowledgeUseCase extends AskKnowledgeUseCase {
  private readonly env: RuntimeEnvironment;

  constructor(
    private readonly askAgentGateway: AskAgentGateway,
    private readonly askAgentToolsService: AskAgentToolsService,
    private readonly contentRepository: ContentRepository,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
    private readonly aiEntitlement: AiEntitlementService,
  ) {
    super();
    this.env = this.runtimeEnv.read();
  }

  async execute(
    question: string,
    userId: string,
    options: AskKnowledgeOptions = {},
  ): Promise<AskKnowledgeResult> {
    this.logger.info('ask_knowledge.agent.start', {
      userId,
      question,
      workspaceId: options.workspaceId,
      projectId: options.projectId,
      hasConversationHistory: Boolean(options.conversationHistory?.length),
    });

    const workspaces = await this.contentRepository.listWorkspaces(userId);
    const matchedWorkspace = options.workspaceId
      ? workspaces.find((w) => w.id === options.workspaceId)
      : undefined;
    const workspaceSlug = matchedWorkspace?.workspaceSlug || workspaces[0]?.workspaceSlug || 'default';

    await this.aiEntitlement.requireAndConsume({
      userId,
      workspaceSlug,
      provider: IntegrationProvider.AiConversation,
      operation: AiOperationType.ASK_KNOWLEDGE,
      metadata: { question, workspaceSlug },
    });

    const embeddingConfig = this.buildEmbeddingConfig();
    const conversationHistory = options.conversationHistory?.slice(-5);

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

    const tracker = new AgentContextTracker();
    const tools = this.askAgentToolsService.buildTools(
      userId,
      options,
      embeddingConfig,
      ragConfig,
      tracker,
    );

    let agentResult: AnswerGenerationResponse | null = null;
    try {
      agentResult = await this.askAgentGateway.run(
        this.buildConversationAiConfig(),
        {
          question,
          conversationHistory,
          workspaceId: options.workspaceId,
          projectId: options.projectId,
        },
        tools,
      );
    } catch (error) {
      const err = error as Record<string, unknown>;
      this.logger.error('ask_knowledge.agent.execution_error', {
        cause: error instanceof Error ? error.message : String(error),
        provider: err.provider ?? this.env.conversationAiProvider,
        model: err.model ?? this.env.conversationAiModel,
      });
    }

    if (!agentResult) {
      this.logger.warn('ask_knowledge.agent.generation_failed', {
        provider: this.env.conversationAiProvider,
        model: this.env.conversationAiModel,
      });
      return {
        ok: true,
        answer:
          'I am unable to generate an answer at the moment because the AI service is temporarily unavailable or encountered an issue. Please check your AI provider configuration or try again in a few moments.',
        confidence: ConversationConfidence.Low,
        requestedAttachments: false,
        sources: [],
        relatedNotes: [],
      };
    }

    const trackerSources = tracker.getSources();
    const trackerMap = new Map(trackerSources.map((s) => [s.noteId, s]));

    let finalSources = trackerSources;
    if (agentResult.sources && agentResult.sources.length > 0) {
      const enriched = agentResult.sources.map((s) => {
        const fromTracker = trackerMap.get(s.noteId);
        return {
          noteId: s.noteId,
          title: fromTracker?.title || s.title || '',
          path: fromTracker?.path || s.path || '',
        };
      });
      if (enriched.length > 0) {
        finalSources = enriched;
      }
    }

    const relatedNotes = tracker.getRelatedNotes();

    this.logger.info('ask_knowledge.agent.complete', {
      confidence: agentResult.confidence,
      sourcesCount: finalSources.length,
      relatedNotesCount: relatedNotes.length,
    });

    return {
      ok: true,
      answer: agentResult.answer,
      confidence: agentResult.confidence,
      requestedAttachments: agentResult.requestedAttachments,
      requestedAttachmentPattern: agentResult.requestedAttachmentPattern,
      sources: finalSources,
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
}
