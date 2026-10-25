import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import {
  agentConversationStateSchema,
  type AgentConversationState,
} from '../../../contracts/agent-conversation.js';
import { type ConversationInput } from '../../../contracts/conversation.js';
import { IntegrationProvider, AgentConversationAction } from '../../../contracts/enums.js';
import { displayNameFromProjectSlug, normalizeWorkspaceSlug, slugify } from '../../../domain/strings.js';
import { currentDateTimeInTimeZone, nowIso } from '../../../domain/time.js';
import { AppLogger } from '../../../observability/logger.js';
import { IngestAgentGateway } from '../../ports/conversation/ingest-agent.gateway.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { ConversationStateRepository } from '../../ports/reminders/workflow-state.repository.js';
import { isCancel } from '../../utils/conversation/conversation-command.utils.js';
import { isConversationStateExpired } from '../../utils/conversation/conversation-state.utils.js';
import { IngestEntryUseCase } from '../ingest/ingest-entry.use-case.js';
import { ConversationAgentPresenter } from './services/conversation-agent.presenter.js';
import { ConversationFolderResolutionService } from './services/conversation-folder-resolution.service.js';
import { IngestAgentToolsService } from '../../services/conversation/ingest-agent-tools.service.js';
import { AiOperationType } from '../../../domain/enums/plans.enums.js';
import { AiEntitlementService } from '../../services/ai/ai-entitlement.service.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';
import { toProjectRecord } from '../../mappers/project.mapper.js';
import { AskAgentToolsService, AgentContextTracker } from '../../services/query/ask-agent-tools.service.js';
import { resolveEmbeddingConfig, resolveRagConfig } from '../../utils/query/query-config.utils.js';
import type { AgentTool } from '../../../contracts/agent-tool.js';
import {
  buildAgentConversationPayload as buildAgentPayload,
  buildAgentConversationResult as toAgentResult,
  buildCaptureAgentConversationState as toCaptureAgentState,
  buildClarifyAgentConversationState as toClarifyAgentState,
  buildPendingClarificationContext as toPendingClarificationContext,
  buildReplyAgentConversationState as toReplyAgentState,
  emptyAgentConversationState as EMPTY_AGENT_CONVERSATION_STATE,
  mediaFromInput as mediaFromConversationInput,
} from './services/conversation-agent-state-machine.js';
import type { ingestPayloadSchema } from '../../../contracts/ingest.js';

export type AgentConversationResult = {
  action: AgentConversationAction;
  replyText: string;
  payload: ReturnType<typeof ingestPayloadSchema.parse> | null;
  ingestResult?: Awaited<ReturnType<IngestEntryUseCase['execute']>>;
  answerContext?: {
    answer: string;
    requestedAttachments: boolean;
    requestedAttachmentPattern?: string;
    sources: Array<{ noteId: string; title: string; path: string }>;
    relatedNotes: Array<{ id: string; title: string; path: string; projectSlug?: string; workspaceSlug?: string }>;
  };
  agent: {
    mode: 'agent';
    selectedProjectSlug: string;
    selectedFolderId: string;
    suggestedFolderPath: string[];
    confidence: AgentConversationState['confidence'];
  };
};

export interface ProcessAgentConversationInput {
  input: ConversationInput;
  userId: string;
  workspaceSlug?: string;
  projectSlug?: string;
}

@Injectable()
export class ProcessAgentConversationUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly conversationStates: ConversationStateRepository,
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly ingestAgentGateway: IngestAgentGateway,
    private readonly toolsService: IngestAgentToolsService,
    private readonly presenter: ConversationAgentPresenter,
    private readonly folderResolutionService: ConversationFolderResolutionService,
    private readonly aiEntitlement: AiEntitlementService,
    private readonly askAgentToolsService: AskAgentToolsService,
    private readonly logger: AppLogger,
    private readonly scopeResolver: WorkspaceScopeResolver,
  ) {}

  async execute(
    paramsOrInput: ProcessAgentConversationInput | ConversationInput,
    userIdInput?: string,
    workspaceSlugInput?: string,
    projectSlugInput?: string,
  ): Promise<AgentConversationResult> {
    const params: ProcessAgentConversationInput =
      paramsOrInput && typeof paramsOrInput === 'object' && 'input' in paramsOrInput
        ? (paramsOrInput as ProcessAgentConversationInput)
        : {
            input: paramsOrInput as ConversationInput,
            userId: userIdInput || '',
            workspaceSlug: workspaceSlugInput || 'default',
            projectSlug: projectSlugInput,
          };
    const { input, userId, workspaceSlug = 'default', projectSlug } = params;
    const normalizedWorkspaceSlug = normalizeWorkspaceSlug(workspaceSlug);
    const aiEnabled = await this.aiEntitlement.isEnabled(userId, normalizedWorkspaceSlug, IntegrationProvider.AiConversation);
    if (!aiEnabled) throw new NotFoundException('ai_conversation_not_enabled');

    const key = `agent:${input.chatId}:${input.senderId}`;
    const state = await this.loadState(userId, normalizedWorkspaceSlug, key, projectSlug);
    const messageText = String(input.messageText || '').trim();
    this.logger.info('conversation.agent.turn.start', {
      userId,
      workspaceSlug: normalizedWorkspaceSlug,
      conversationKey: key,
      messageId: input.messageId,
      messageLength: messageText.length,
      hasMedia: input.hasMedia,
      mode: 'react_agent',
    });

    if (!messageText && !input.hasMedia) {
      return this.reply(AgentConversationAction.Ask, this.presenter.emptyTextPrompt(), null, state);
    }
    if (!messageText && input.hasMedia) {
      const nextState = agentConversationStateSchema.parse({
        ...state,
        media: mediaFromConversationInput(input, state),
        lastQuestion: this.presenter.mediaContextPrompt(),
        lastUserMessage: '',
        lastAgentAction: 'ask',
        updatedAt: nowIso(),
      });
      await this.conversationStates.upsert(userId, normalizedWorkspaceSlug, key, nextState);
      return this.reply(AgentConversationAction.Ask, nextState.lastQuestion, null, nextState);
    }
    if (isCancel(messageText)) {
      await this.conversationStates.clear(userId, normalizedWorkspaceSlug, key);
      return this.reply(AgentConversationAction.Cancel, this.presenter.captureCanceled(), null, EMPTY_AGENT_CONVERSATION_STATE);
    }

    return this.processNewTurn(input, userId, normalizedWorkspaceSlug, key, state);
  }

  private async processNewTurn(
    input: ConversationInput,
    userId: string,
    workspaceSlug: string,
    key: string,
    state: AgentConversationState,
  ): Promise<AgentConversationResult> {
    const messageText = String(input.messageText || '').trim();
    const environment = this.environmentProvider.read();

    const entitlement = await this.aiEntitlement.checkAndConsume({
      userId,
      workspaceSlug,
      provider: IntegrationProvider.AiConversation,
      operation: AiOperationType.AGENT_CONVERSATION_TURN,
      metadata: { workspaceSlug, source: 'agent_conversation' },
    });
    if (!entitlement.enabled || !entitlement.quota.allowed) {
      this.logger.warn('conversation.agent.quota_exceeded', {
        userId,
        workspaceSlug,
        limit: entitlement.enabled ? entitlement.quota.limit : undefined,
        current: entitlement.enabled ? entitlement.quota.current : undefined,
      });
      return this.reply(
        AgentConversationAction.Ask,
        `⚠️ You have used all your AI credits for this month (${entitlement.enabled ? entitlement.quota.current : 0}/${entitlement.enabled ? entitlement.quota.limit : 0} credits). Your quota resets at the start of next month.\n\n💡 Upgrade your plan to get more AI credits: https://knowledgebase.sbs/kote/automations/subscription`,
        null,
        state,
      );
    }

    const localDateTime = currentDateTimeInTimeZone(environment.reminderTimeZone);
    const tracker = new AgentContextTracker();
    const workspaceId = (await this.scopeResolver.findWorkspaceId(userId, workspaceSlug)) || undefined;
    const toolset = this.buildTools(userId, workspaceSlug, workspaceId, environment, tracker);
    const pendingClarification = toPendingClarificationContext(state);
    const hasPendingClarification = Boolean(pendingClarification);

    const recentTurns = (state.turns || []).slice(-5).map((t) => ({
      userMessage: t.userMessage,
      agentReply: t.agentReply,
    }));

    const decision = await this.ingestAgentGateway.decide(
      {
        conversationAiProvider: environment.conversationAiProvider,
        conversationAiBaseUrl: environment.conversationAiBaseUrl,
        conversationAiModel: environment.conversationAiModel,
        conversationAiApiKey: environment.conversationAiApiKey,
      },
      {
        messageText,
        workspaceSlug,
        candidateProjectSlug: state.project.selectedProjectSlug || undefined,
        timeZone: environment.reminderTimeZone,
        timeZoneOffset: localDateTime.offset,
        currentLocalDate: localDateTime.date,
        currentLocalTime: localDateTime.time,
        recentTurns: recentTurns.length > 0 ? recentTurns : undefined,
        pendingClarification,
      },
      toolset.tools,
    );

    if (!decision) {
      throw new BadRequestException('conversation_agent_unavailable');
    }

    if (decision.action === 'cancel') {
      await this.conversationStates.clear(userId, workspaceSlug, key);
      return this.reply(AgentConversationAction.Cancel, this.presenter.captureCanceled(), null, EMPTY_AGENT_CONVERSATION_STATE);
    }

    if (decision.action === 'reply') {
      const nextState = toReplyAgentState(state, messageText, decision.replyText);
      await this.conversationStates.upsert(userId, workspaceSlug, key, nextState);

      const sources = tracker.getSources();
      const answerContext = decision.requestedAttachments || sources.length > 0 || toolset.semanticSearchWasUsed()
        ? {
            answer: decision.replyText,
            requestedAttachments: decision.requestedAttachments,
            requestedAttachmentPattern: decision.requestedAttachmentPattern,
            sources,
            relatedNotes: tracker.getRelatedNotes(),
          }
        : undefined;
      return {
        ...this.reply(AgentConversationAction.Answer, decision.replyText, null, nextState),
        answerContext,
      };
    }

    if (decision.action === 'clarify') {
      const clarification = decision.replyText || this.presenter.needsOneMoreDetail();
      const nextState = toClarifyAgentState(state, messageText, decision, clarification);
      await this.conversationStates.upsert(userId, workspaceSlug, key, nextState);
      return this.reply(AgentConversationAction.Ask, clarification, null, nextState);
    }

    const nextState = toCaptureAgentState(input, state, decision, hasPendingClarification);
    return this.submitState(input, userId, workspaceSlug, key, nextState);
  }

  private async submitState(
    input: ConversationInput,
    userId: string,
    workspaceSlug: string,
    key: string,
    state: AgentConversationState,
  ): Promise<AgentConversationResult> {
    await this.ensureProjectExistsForSubmission(userId, workspaceSlug, state.project.selectedProjectSlug);
    const folderId = await this.folderResolutionService.resolveFolderIdForSubmission(userId, state);
    const payload = buildAgentPayload(input, state, this.environmentProvider.read().reminderTimeZone);
    const ingestResult = await this.ingestEntryUseCase.execute(payload, userId, workspaceSlug, { folderId: folderId || undefined });

    this.logger.info('conversation.agent.submit.saved', {
      userId,
      workspaceSlug,
      conversationKey: key,
      noteId: ingestResult.noteId,
      projectSlug: ingestResult.project,
      folderId,
      eventPath: ingestResult.eventPath,
      mode: 'react_agent',
    });

    const replyText = this.presenter.noteSaved(ingestResult, this.environmentProvider.read().reminderTimeZone);

    const savedTurn = {
      userMessage: input.messageText,
      agentReply: replyText,
      action: AgentConversationAction.Submit,
    };
    const nextCleanState = agentConversationStateSchema.parse({
      ...EMPTY_AGENT_CONVERSATION_STATE,
      project: {
        selectedProjectSlug: state.project.selectedProjectSlug || '',
      },
      turns: [...(state.turns || []), savedTurn].slice(-5),
      updatedAt: nowIso(),
    });
    await this.conversationStates.upsert(userId, workspaceSlug, key, nextCleanState);

    return this.reply(
      AgentConversationAction.Submit,
      replyText,
      payload,
      nextCleanState,
      ingestResult,
      {
        selectedProjectSlug: state.project.selectedProjectSlug,
        selectedFolderId: folderId,
        suggestedFolderPath: state.folder.suggestedFolderPath,
        confidence: state.confidence,
      },
    );
  }

  private async ensureProjectExistsForSubmission(userId: string, workspaceSlug: string, projectSlug: string) {
    const normalizedProjectSlug = slugify(projectSlug);
    if (!normalizedProjectSlug || normalizedProjectSlug === 'inbox') return;

    const existingScope = await this.scopeResolver.resolveContentScopeFromSlugs(userId, {
      projectSlug: normalizedProjectSlug,
    });
    if (existingScope.project?.enabled) return;

    const workspaceScope = await this.scopeResolver.resolveContentScopeFromSlugs(userId, { workspaceSlug });
    if (!workspaceScope.workspace) return;

    const projectDto = {
      displayName: displayNameFromProjectSlug(normalizedProjectSlug),
      projectSlug: normalizedProjectSlug,
      repositoryIds: [],
      defaultTags: [],
    };
    const projectRecord = toProjectRecord(projectDto, workspaceScope.workspace.id, workspaceSlug, []);
    await this.contentRepository.upsertProject(userId, projectRecord);
  }

  private async loadState(userId: string, workspaceSlug: string, key: string, projectSlug?: string): Promise<AgentConversationState> {
    const saved = await this.conversationStates.get(userId, workspaceSlug, key);
    const parsed = saved ? agentConversationStateSchema.safeParse(saved.state) : null;
    let state = EMPTY_AGENT_CONVERSATION_STATE;

    if (parsed?.success) {
      if (isConversationStateExpired(parsed.data.updatedAt, saved?.updatedAt || '')) {
        this.logger.info('conversation.agent.state.expired', {
          userId,
          workspaceSlug,
          conversationKey: key,
          updatedAt: parsed.data.updatedAt || saved?.updatedAt || '',
        });
      } else {
        state = parsed.data;
      }
    }

    if (projectSlug) {
      return {
        ...state,
        project: {
          ...state.project,
          selectedProjectSlug: projectSlug,
        },
      };
    }

    return state;
  }

  private buildTools(
    userId: string,
    workspaceSlug: string,
    workspaceId: string | undefined,
    environment: ReturnType<RuntimeEnvironmentProvider['read']>,
    tracker: AgentContextTracker,
  ): { tools: AgentTool[]; semanticSearchWasUsed: () => boolean } {
    const captureTools = this.toolsService.buildTools(userId, workspaceSlug, environment.reminderTimeZone);

    if (!workspaceId) {
      return {
        tools: captureTools,
        semanticSearchWasUsed: () => false,
      };
    }

    const embeddingConfig = resolveEmbeddingConfig(environment);
    const ragConfig = resolveRagConfig(environment);

    const knowledgeTools = this.askAgentToolsService
      .buildTools(userId, { workspaceId }, embeddingConfig, ragConfig, tracker)
      .filter((tool) => [
        'search_knowledge',
        'get_note_content',
        'list_recent_notes',
        'list_note_attachments',
      ].includes(tool.name));

    let semanticSearchWasUsed = false;
    let semanticSearchEntitlementChecked = false;
    let semanticSearchAllowed = false;

    const guardedKnowledgeTools = knowledgeTools.map((tool) => {
      if (tool.name !== 'search_knowledge') {
        return tool;
      }

      return {
        ...tool,
        execute: async (args: Record<string, any>) => {
          if (!semanticSearchEntitlementChecked) {
            semanticSearchAllowed = await this.aiEntitlement.isEnabled(
              userId,
              workspaceSlug,
              IntegrationProvider.AiConversation,
            );
            semanticSearchEntitlementChecked = true;
          }

          if (!semanticSearchAllowed) {
            return { error: 'Knowledge search is not enabled for this workspace.' };
          }

          semanticSearchWasUsed = true;
          return tool.execute(args);
        },
      };
    });

    return {
      tools: [
        ...captureTools.filter((tool) => !guardedKnowledgeTools.some((knowledgeTool) => knowledgeTool.name === tool.name)),
        ...guardedKnowledgeTools,
      ],
      semanticSearchWasUsed: () => semanticSearchWasUsed,
    };
  }

  private reply(
    action: AgentConversationResult['action'],
    replyText: string,
    payload: AgentConversationResult['payload'],
    state: AgentConversationState,
    ingestResult?: AgentConversationResult['ingestResult'],
    overrides?: Partial<AgentConversationResult['agent']>,
  ): AgentConversationResult {
    return toAgentResult({
      action,
      replyText,
      payload,
      state,
      ingestResult,
      overrides,
    });
  }
}
