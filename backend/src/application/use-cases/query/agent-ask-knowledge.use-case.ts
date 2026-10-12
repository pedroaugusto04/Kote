import { Injectable } from '@nestjs/common';

import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import { AskAgentGateway } from '../../ports/query/ask-agent.gateway.js';
import type { AnswerGenerationResponse } from '../../ports/query/answer-generation.gateway.js';
import { AskAgentToolsService, AgentContextTracker } from '../../services/query/ask-agent-tools.service.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../ports/observability/runtime-environment.port.js';
import { ConversationConfidence, IntegrationProvider } from '../../../contracts/enums.js';
import { currentDateTimeInTimeZone } from '../../../domain/time.js';
import { AiOperationType } from '../../../domain/enums/plans.enums.js';
import { AiEntitlementService } from '../../services/ai/ai-entitlement.service.js';
import { AskKnowledgeUseCase, type AskKnowledgeOptions, type AskKnowledgeResult } from './ask-knowledge.use-case.js';
import {
  AI_UNAVAILABLE_FALLBACK_ANSWER,
  resolveConversationAiConfig,
  resolveEmbeddingConfig,
  resolveRagConfig,
} from '../../utils/query/query-config.utils.js';

@Injectable()
export class AgentAskKnowledgeUseCase extends AskKnowledgeUseCase {
  constructor(
    private readonly askAgentGateway: AskAgentGateway,
    private readonly askAgentToolsService: AskAgentToolsService,
    private readonly contentRepository: ContentRepository,
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
    this.logger.info('ask_knowledge.agent.start', {
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
    const ragConfig = resolveRagConfig(this.env);
    const conversationHistory = options.conversationHistory?.slice(-5);

    const tracker = new AgentContextTracker();
    const tools = this.askAgentToolsService.buildTools(
      userId,
      options,
      embeddingConfig,
      ragConfig,
      tracker,
    );

    let projectSlug: string | undefined;
    if (options.projectId) {
      const projects = await this.contentRepository.listProjects(userId);
      const matchedProject = projects.find((p) => p.id === options.projectId);
      projectSlug = matchedProject?.projectSlug;
    }

    const localDateTime = currentDateTimeInTimeZone(this.env.reminderTimeZone);

    let agentResult: AnswerGenerationResponse | null = null;
    try {
      agentResult = await this.askAgentGateway.run(
        resolveConversationAiConfig(this.env),
        {
          question,
          conversationHistory,
          workspaceId: options.workspaceId,
          workspaceSlug,
          projectId: options.projectId,
          projectSlug,
          currentLocalDate: localDateTime.date,
          currentLocalTime: localDateTime.time,
          timeZone: this.env.reminderTimeZone,
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
        answer: AI_UNAVAILABLE_FALLBACK_ANSWER,
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
}
