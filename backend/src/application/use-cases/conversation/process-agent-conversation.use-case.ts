import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import {
  agentConversationStateSchema,
  type AgentConversationState,
  type ConversationAgentDecision,
} from '../../../contracts/agent-conversation.js';
import { type ConversationInput } from '../../../contracts/conversation.js';
import { IntegrationProvider, AgentConversationAction, SourceChannel } from '../../../contracts/enums.js';
import { displayNameFromProjectSlug, slugify } from '../../../domain/strings.js';
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
import { resolveSourceChannel } from '../../utils/integration/source-channel.utils.js';
import { resolveContentScopeFromSlugs } from '../../utils/content/content-scope.utils.js';
import { toProjectRecord } from '../../mappers/project.mapper.js';
import {
  buildAgentConversationPayload as buildAgentPayload,
  emptyAgentConversationState as EMPTY_AGENT_CONVERSATION_STATE,
  mediaFromInput as mediaFromConversationInput,
  resolveSelectedProjectSlug as resolveAgentSelectedProjectSlug,
} from './services/conversation-agent-state-machine.js';
import type { ingestPayloadSchema } from '../../../contracts/ingest.js';

export type AgentConversationResult = {
  action: AgentConversationAction;
  replyText: string;
  payload: ReturnType<typeof ingestPayloadSchema.parse> | null;
  ingestResult?: Awaited<ReturnType<IngestEntryUseCase['execute']>>;
  agent: {
    mode: 'agent';
    selectedProjectSlug: string;
    selectedFolderId: string;
    suggestedFolderPath: string[];
    confidence: AgentConversationState['confidence'];
  };
};

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
    private readonly logger?: AppLogger,
  ) {}

  async execute(
    input: ConversationInput,
    userId: string,
    workspaceSlug = 'default',
    projectSlug?: string,
  ): Promise<AgentConversationResult> {
    const normalizedWorkspaceSlug = slugify(workspaceSlug) || 'default';
    const aiEnabled = await this.aiEntitlement.isEnabled(userId, normalizedWorkspaceSlug, IntegrationProvider.AiConversation);
    if (!aiEnabled) throw new NotFoundException('ai_conversation_not_enabled');

    const sourceChannel = resolveSourceChannel({
      senderId: input.senderId,
      chatId: input.chatId,
    });

    const key = `agent:${input.chatId}:${input.senderId}`;
    let state = await this.loadState(userId, normalizedWorkspaceSlug, key);
    if (projectSlug) {
      state = {
        ...state,
        project: {
          ...state.project,
          selectedProjectSlug: projectSlug,
        },
      };
    }
    const messageText = String(input.messageText || '').trim();
    this.logger?.info('conversation.agent.turn.start', {
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

    return this.processNewTurn(input, userId, normalizedWorkspaceSlug, key, state, sourceChannel);
  }

  private async processNewTurn(
    input: ConversationInput,
    userId: string,
    workspaceSlug: string,
    key: string,
    state: AgentConversationState,
    _sourceChannel: SourceChannel,
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
      this.logger?.warn('conversation.agent.quota_exceeded', {
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
    const tools = this.toolsService.buildTools(userId, workspaceSlug);

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
        currentLocalDate: localDateTime.date,
        currentLocalTime: localDateTime.time,
      },
      tools,
    );

    if (!decision) {
      throw new BadRequestException('conversation_agent_unavailable');
    }

    if (this.isEmptyAgentDraftAsk(decision)) {
      return this.reply(AgentConversationAction.Ask, this.presenter.couldNotUnderstand(), null, state);
    }

    if (decision.action === 'cancel') {
      await this.conversationStates.clear(userId, workspaceSlug, key);
      return this.reply(AgentConversationAction.Cancel, this.presenter.captureCanceled(), null, EMPTY_AGENT_CONVERSATION_STATE);
    }

    const rawText = String(decision.resolvedDraft?.rawText || messageText).trim() || messageText;
    const selectedProjectSlug = resolveAgentSelectedProjectSlug(decision.selectedProjectSlug, state) || (rawText ? 'inbox' : '');

    if (decision.action === 'ask' && !rawText) {
      const nextState = agentConversationStateSchema.parse({
        ...state,
        lastQuestion: decision.replyText || this.presenter.couldNotUnderstand(),
        lastUserMessage: messageText,
        lastAgentAction: 'ask',
        updatedAt: nowIso(),
      });
      await this.conversationStates.upsert(userId, workspaceSlug, key, nextState);
      return this.reply(AgentConversationAction.Ask, decision.replyText || this.presenter.couldNotUnderstand(), null, nextState);
    }

    const isInbox = !selectedProjectSlug || selectedProjectSlug === 'inbox';
    const nextState = agentConversationStateSchema.parse({
      ...state,
      media: mediaFromConversationInput(input, state),
      project: {
        selectedProjectSlug,
      },
      folder: {
        selectedFolderId: isInbox ? '' : (decision.selectedFolderId || ''),
        suggestedFolderPath: isInbox ? [] : (decision.suggestedFolderPath || []),
        placeInRoot: isInbox ? true : Boolean(decision.placeInRoot),
      },
      draft: {
        rawText,
        title: decision.resolvedDraft?.title || '',
        kind: decision.resolvedDraft?.kind || state.draft.kind || 'note',
        canonicalType: decision.resolvedDraft?.canonicalType || state.draft.canonicalType || 'knowledge',
        importance: decision.resolvedDraft?.importance || state.draft.importance || 'normal',
        tags: decision.resolvedDraft?.tags || state.draft.tags || [],
        reminderAt: decision.resolvedDraft?.reminderAt || state.draft.reminderAt || null,
      },
      confidence: decision.confidence,
      lastUserMessage: messageText,
      lastAgentAction: decision.action,
      updatedAt: nowIso(),
    });

    return this.submitState(input, userId, workspaceSlug, key, nextState, decision.replyText);
  }

  private async submitState(
    input: ConversationInput,
    userId: string,
    workspaceSlug: string,
    key: string,
    state: AgentConversationState,
    agentReplyText?: string,
  ): Promise<AgentConversationResult> {
    await this.ensureProjectExistsForSubmission(userId, workspaceSlug, state.project.selectedProjectSlug);
    const folderId = await this.folderResolutionService.resolveFolderIdForSubmission(userId, state);
    const payload = buildAgentPayload(input, state, this.environmentProvider.read().reminderTimeZone);
    const ingestResult = await this.ingestEntryUseCase.execute(payload, userId, workspaceSlug, { folderId: folderId || undefined });
    await this.conversationStates.clear(userId, workspaceSlug, key);

    this.logger?.info('conversation.agent.submit.saved', {
      userId,
      workspaceSlug,
      conversationKey: key,
      noteId: ingestResult.noteId,
      projectSlug: ingestResult.project,
      folderId,
      eventPath: ingestResult.eventPath,
      mode: 'react_agent',
    });

    const replyText = this.presenter.noteSaved(ingestResult);

    return this.reply(
      AgentConversationAction.Submit,
      replyText,
      payload,
      EMPTY_AGENT_CONVERSATION_STATE,
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

    const existingScope = await resolveContentScopeFromSlugs(this.contentRepository, userId, {
      projectSlug: normalizedProjectSlug,
    });
    if (existingScope.project?.enabled) return;

    const workspaceScope = await resolveContentScopeFromSlugs(this.contentRepository, userId, { workspaceSlug });
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

  private async loadState(userId: string, workspaceSlug: string, key: string) {
    const saved = await this.conversationStates.get(userId, workspaceSlug, key);
    const parsed = saved ? agentConversationStateSchema.safeParse(saved.state) : null;
    if (!parsed?.success) return EMPTY_AGENT_CONVERSATION_STATE;
    if (this.isExpiredState(parsed.data, saved?.updatedAt || '')) {
      await this.conversationStates.clear(userId, workspaceSlug, key);
      this.logger?.info('conversation.agent.state.expired', {
        userId,
        workspaceSlug,
        conversationKey: key,
        updatedAt: parsed.data.updatedAt || saved?.updatedAt || '',
      });
      return EMPTY_AGENT_CONVERSATION_STATE;
    }
    return parsed.data;
  }

  private isExpiredState(state: AgentConversationState, recordUpdatedAt: string) {
    return isConversationStateExpired(state.updatedAt, recordUpdatedAt);
  }

  private isEmptyAgentDraftAsk(decision: ConversationAgentDecision) {
    return decision.action === 'ask'
      && !String(decision.resolvedDraft?.rawText || '').trim()
      && !String(decision.selectedProjectSlug || '').trim();
  }

  private reply(
    action: AgentConversationResult['action'],
    replyText: string,
    payload: AgentConversationResult['payload'],
    state: AgentConversationState,
    ingestResult?: AgentConversationResult['ingestResult'],
    overrides?: Partial<AgentConversationResult['agent']>,
  ): AgentConversationResult {
    return {
      action,
      replyText,
      payload,
      ingestResult,
      agent: {
        mode: 'agent',
        selectedProjectSlug: overrides?.selectedProjectSlug || state.project.selectedProjectSlug,
        selectedFolderId: overrides?.selectedFolderId || state.folder.selectedFolderId,
        suggestedFolderPath: overrides?.suggestedFolderPath || state.folder.suggestedFolderPath,
        confidence: overrides?.confidence || state.confidence,
      },
    };
  }
}
