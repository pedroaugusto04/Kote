import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import {
  agentConversationStateSchema,
  type AgentConversationApprovalIntent,
  type AgentConversationState,
} from '../../../contracts/agent-conversation.js';
import { type ConversationInput } from '../../../contracts/conversation.js';
import { CredentialRecordStatus, IntegrationProvider } from '../../../contracts/enums.js';
import { ingestPayloadSchema } from '../../../contracts/ingest.js';
import { slugify } from '../../../domain/strings.js';
import { currentDateTimeInTimeZone, nowIso } from '../../../domain/time.js';
import { AppLogger } from '../../../observability/logger.js';
import type { ProjectFolderRecord, ProjectRecord } from '../../models/repository-records.models.js';
import { ConversationAgentGateway, type ConversationAgentResponse } from '../../ports/conversation-agent.gateway.js';
import { ContentRepository } from '../../ports/content.repository.js';
import { CredentialRepository } from '../../ports/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/runtime-environment.port.js';
import { ConversationStateRepository } from '../../ports/workflow-state.repository.js';
import { isCancel } from '../../utils/conversation-command.utils.js';
import { buildProjectFolderTree } from '../../utils/project-folder.utils.js';
import { IngestEntryUseCase } from '../ingest/ingest-entry.use-case.js';
import { ConversationAgentPresenter } from './services/conversation-agent.presenter.js';
import { ConversationFolderResolutionService } from './services/conversation-folder-resolution.service.js';
import {
  buildAgentConversationPayload as buildAgentPayload,
  buildNextAgentConversationState,
  emptyAgentConversationState as EMPTY_AGENT_CONVERSATION_STATE,
  mediaFromInput as mediaFromConversationInput,
  parseApprovalIntent,
  resolveSelectedProjectSlug as resolveAgentSelectedProjectSlug,
  sanitizeExistingProjectSlug as sanitizeExistingAgentProjectSlug,
  serializeFolderTreeNode as serializeAgentFolderTreeNode,
} from './services/conversation-agent-state-machine.js';

type AgentConversationResult = {
  action: 'ask' | 'confirm' | 'cancel' | 'submit';
  replyText: string;
  payload: ReturnType<typeof ingestPayloadSchema.parse> | null;
  ingestResult?: Awaited<ReturnType<IngestEntryUseCase['execute']>>;
  agent: {
    mode: 'agent';
    pendingApproval: AgentConversationState['pendingApproval'];
    selectedProjectSlug: string;
    selectedFolderId: string;
    suggestedFolderPath: string[];
    confidence: AgentConversationState['confidence'];
  };
};

type AgentDecisionTurn = {
  projects: ProjectRecord[];
  candidateProjectSlug: string;
  candidateFolders: ProjectFolderRecord[];
  decision: ConversationAgentResponse;
};

const AGENT_CONVERSATION_STATE_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class ProcessAgentConversationUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly conversationStates: ConversationStateRepository,
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly conversationAgentGateway: ConversationAgentGateway,
    private readonly presenter: ConversationAgentPresenter,
    private readonly folderResolutionService: ConversationFolderResolutionService,
    private readonly credentials?: CredentialRepository,
    private readonly logger?: AppLogger,
  ) {}

  async execute(input: ConversationInput, userId: string, workspaceSlug = 'default'): Promise<AgentConversationResult> {
    const normalizedWorkspaceSlug = slugify(workspaceSlug) || 'default';
    await this.assertAgentEnabled(userId, normalizedWorkspaceSlug);

    const key = `agent:${input.chatId}:${input.senderId}`;
    let state = await this.loadState(userId, normalizedWorkspaceSlug, key);
    const messageText = String(input.messageText || '').trim();
    this.logger?.info('conversation.agent.turn.start', {
      userId,
      workspaceSlug: normalizedWorkspaceSlug,
      conversationKey: key,
      messageId: input.messageId,
      messageLength: messageText.length,
      hasMedia: input.hasMedia,
      pendingApproval: state.pendingApproval,
    });

    if (!messageText && !input.hasMedia) {
      return this.reply('ask', this.presenter.emptyTextPrompt(), null, state);
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
      return this.reply('ask', nextState.lastQuestion, null, nextState);
    }
    if (isCancel(messageText)) {
      await this.conversationStates.clear(userId, normalizedWorkspaceSlug, key);
      return this.reply('cancel', this.presenter.captureCanceled(), null, EMPTY_AGENT_CONVERSATION_STATE);
    }
    if (this.isApprovalWithoutPendingState(messageText, state)) {
      return this.reply('ask', this.presenter.noPendingConfirmation(), null, state);
    }
    if (state.pendingApproval === 'final_confirmation') {
      return this.handleFinalConfirmation(input, userId, normalizedWorkspaceSlug, key, state);
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
    const { projects, candidateProjectSlug, candidateFolders, decision } = await this.requestAgentDecision(
      input,
      userId,
      workspaceSlug,
      state,
    );
    if (this.isEmptyAgentDraftAsk(decision)) {
      return this.reply('ask', this.presenter.couldNotUnderstand(), null, state);
    }

    const selectedProjectSlug = resolveAgentSelectedProjectSlug(decision.selectedProjectSlug, state, projects);
    const foldersForDecision = selectedProjectSlug && selectedProjectSlug !== 'inbox'
      ? selectedProjectSlug === candidateProjectSlug
        ? candidateFolders
        : await this.contentRepository.listProjectFolders(userId, selectedProjectSlug)
      : [];
    const nextState = buildNextAgentConversationState({
      current: state,
      messageText,
      media: mediaFromConversationInput(input, state),
      decision,
      projects,
      candidateFolders: foldersForDecision,
      reminderTimeZone: environment.reminderTimeZone,
    });
    await this.conversationStates.upsert(userId, workspaceSlug, key, nextState);
    this.logger?.info('conversation.agent.state.updated', {
      userId,
      workspaceSlug,
      conversationKey: key,
      action: decision.action,
      approvalIntent: decision.approvalIntent,
      pendingApproval: nextState.pendingApproval,
      selectedProjectSlug: nextState.project.selectedProjectSlug,
      selectedFolderId: nextState.folder.selectedFolderId,
      suggestedFolderPath: nextState.folder.suggestedFolderPath,
      rawTextLength: nextState.draft.rawText.length,
      confidence: nextState.confidence,
    });

    if (!nextState.draft.rawText) {
      return this.reply('ask', this.presenter.couldNotUnderstand(), null, nextState);
    }
    if (!nextState.project.selectedProjectSlug) {
      return this.reply('ask', this.presenter.projectPrompt(decision.replyText, projects), null, nextState);
    }
    if (nextState.pendingApproval === 'final_confirmation') {
      const finalConfirmation = this.presenter.finalConfirmationPrompt(nextState, {
        willCreateProject: this.shouldCreateProject(nextState.project.selectedProjectSlug, projects),
      });
      const finalState = {
        ...nextState,
        lastQuestion: finalConfirmation,
        lastAgentAction: 'confirm' as const,
        updatedAt: nowIso(),
      };
      await this.conversationStates.upsert(userId, workspaceSlug, key, finalState);
      return this.reply('confirm', finalConfirmation, null, finalState);
    }

    return this.reply('ask', decision.replyText || this.presenter.needsOneMoreDetail(), null, nextState);
  }

  private async assertAgentEnabled(userId: string, workspaceSlug: string) {
    if (!this.credentials) throw new BadRequestException('conversation_agent_not_configured');
    const credential = await this.credentials.findCredential(userId, workspaceSlug, IntegrationProvider.AiConversation);
    const enabled = Boolean(credential && credential.status === CredentialRecordStatus.Connected && !credential.revokedAt);
    if (!enabled) throw new NotFoundException('ai_conversation_not_enabled');
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
    const updatedAt = Date.parse(state.updatedAt || recordUpdatedAt || '');
    if (!Number.isFinite(updatedAt)) return false;
    return Date.now() - updatedAt > AGENT_CONVERSATION_STATE_TTL_MS;
  }

  private isApprovalWithoutPendingState(messageText: string, state: AgentConversationState) {
    if (state.pendingApproval !== 'none' || state.draft.rawText) return false;
    const intent = parseApprovalIntent(messageText);
    return intent === 'approve' || intent === 'reject';
  }

  private isEmptyAgentDraftAsk(decision: ConversationAgentResponse) {
    return decision.action === 'ask'
      && !String(decision.resolvedDraft.rawText || '').trim()
      && !String(decision.selectedProjectSlug || '').trim();
  }

  private async requestAgentDecision(
    input: ConversationInput,
    userId: string,
    workspaceSlug: string,
    state: AgentConversationState,
  ): Promise<AgentDecisionTurn> {
    const projects = (await this.contentRepository.listProjects(userId))
      .filter((project) => project.enabled && project.workspaceSlug === workspaceSlug);
    const candidateProjectSlug = sanitizeExistingAgentProjectSlug(state.project.selectedProjectSlug, projects);
    const candidateFolders = candidateProjectSlug && candidateProjectSlug !== 'inbox'
      ? await this.contentRepository.listProjectFolders(userId, candidateProjectSlug)
      : [];
    const environment = this.environmentProvider.read();
    const localDateTime = currentDateTimeInTimeZone(environment.reminderTimeZone);

    try {
      const decision = await this.conversationAgentGateway.decide(
        {
          conversationAiProvider: environment.conversationAiProvider,
          conversationAiBaseUrl: environment.conversationAiBaseUrl,
          conversationAiModel: environment.conversationAiModel,
          conversationAiApiKey: environment.conversationAiApiKey,
        },
        {
          messageText: String(input.messageText || '').trim(),
          currentState: state,
          availableProjects: projects.map((project) => ({
            projectSlug: project.projectSlug,
            displayName: project.displayName,
            defaultTags: project.defaultTags,
          })),
          candidateProjectSlug,
          candidateFolders: buildProjectFolderTree(candidateFolders).map(serializeAgentFolderTreeNode),
          timeZone: environment.reminderTimeZone,
          currentLocalDate: localDateTime.date,
          currentLocalTime: localDateTime.time,
        },
      );
      if (!decision) throw new BadRequestException('conversation_agent_unavailable');
      this.logger?.info('conversation.agent.decision', {
        userId,
        workspaceSlug,
        action: decision.action,
        approvalIntent: decision.approvalIntent,
        pendingApproval: decision.pendingApproval,
        selectedProjectSlug: decision.selectedProjectSlug,
        selectedFolderId: decision.selectedFolderId,
        suggestedFolderPath: decision.suggestedFolderPath,
        placeInRoot: decision.placeInRoot,
        rawTextLength: decision.resolvedDraft.rawText.length,
        confidence: decision.confidence,
      });
      return { projects, candidateProjectSlug, candidateFolders, decision };
    } catch (error) {
      this.logger?.error('conversation.agent.decision_failed', {
        userId,
        workspaceSlug,
        pendingApproval: state.pendingApproval,
        messageId: input.messageId,
        ...serializeErrorForLog(error),
      });
      throw error;
    }
  }

  private async handleFinalConfirmation(
    input: ConversationInput,
    userId: string,
    workspaceSlug: string,
    key: string,
    state: AgentConversationState,
  ): Promise<AgentConversationResult> {
    const approval = await this.resolveApprovalTurn(input, userId, workspaceSlug, state);
    const intent = approval.intent;
    this.logger?.info('conversation.agent.approval', {
      userId,
      workspaceSlug,
      conversationKey: key,
      pendingApproval: state.pendingApproval,
      approvalIntent: intent,
    });
    if (intent === 'reject' || intent === 'cancel') {
      await this.conversationStates.clear(userId, workspaceSlug, key);
      return this.reply('cancel', this.presenter.noteDiscarded(), null, EMPTY_AGENT_CONVERSATION_STATE);
    }
    if (intent !== 'approve') {
      if (approval.turn && !this.shouldReplacePendingConfirmation(approval.turn.decision)) {
        return this.applyPendingConfirmationEdit(input, userId, workspaceSlug, key, state, approval.turn);
      }
      await this.conversationStates.clear(userId, workspaceSlug, key);
      this.logger?.info('conversation.agent.pending_replaced', {
        userId,
        workspaceSlug,
        conversationKey: key,
        messageId: input.messageId,
      });
      return this.processNewTurn(input, userId, workspaceSlug, key, EMPTY_AGENT_CONVERSATION_STATE);
    }

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
    });
    return this.reply(
      'submit',
      this.presenter.noteSaved(),
      payload,
      EMPTY_AGENT_CONVERSATION_STATE,
      ingestResult,
      {
        pendingApproval: 'none',
        selectedProjectSlug: state.project.selectedProjectSlug,
        selectedFolderId: folderId,
        suggestedFolderPath: state.folder.suggestedFolderPath,
        confidence: state.confidence,
      },
    );
  }

  private async applyPendingConfirmationEdit(
    input: ConversationInput,
    userId: string,
    workspaceSlug: string,
    key: string,
    state: AgentConversationState,
    turn: AgentDecisionTurn,
  ): Promise<AgentConversationResult> {
    const messageText = String(input.messageText || '').trim();
    const environment = this.environmentProvider.read();
    const selectedProjectSlug = resolveAgentSelectedProjectSlug(turn.decision.selectedProjectSlug, state, turn.projects);
    const foldersForDecision = selectedProjectSlug && selectedProjectSlug !== 'inbox'
      ? selectedProjectSlug === turn.candidateProjectSlug
        ? turn.candidateFolders
        : await this.contentRepository.listProjectFolders(userId, selectedProjectSlug)
      : [];
    const nextState = buildNextAgentConversationState({
      current: state,
      messageText,
      media: mediaFromConversationInput(input, state),
      decision: turn.decision,
      projects: turn.projects,
      candidateFolders: foldersForDecision,
      reminderTimeZone: environment.reminderTimeZone,
    });
    await this.conversationStates.upsert(userId, workspaceSlug, key, nextState);
    if (!nextState.draft.rawText) {
      return this.reply('ask', this.presenter.couldNotUnderstand(), null, nextState);
    }
    if (!nextState.project.selectedProjectSlug) {
      return this.reply('ask', this.presenter.projectPrompt(turn.decision.replyText, turn.projects), null, nextState);
    }
    if (nextState.pendingApproval === 'final_confirmation') {
      const finalConfirmation = this.presenter.finalConfirmationPrompt(nextState, {
        willCreateProject: this.shouldCreateProject(nextState.project.selectedProjectSlug, turn.projects),
      });
      const finalState = {
        ...nextState,
        lastQuestion: finalConfirmation,
        lastAgentAction: 'confirm' as const,
        updatedAt: nowIso(),
      };
      await this.conversationStates.upsert(userId, workspaceSlug, key, finalState);
      return this.reply('confirm', finalConfirmation, null, finalState);
    }
    return this.reply('ask', turn.decision.replyText || this.presenter.needsOneMoreDetail(), null, nextState);
  }

  private shouldReplacePendingConfirmation(decision: ConversationAgentResponse) {
    return decision.turnIntent === 'new_capture' || decision.turnIntent === 'unrelated';
  }

  private shouldCreateProject(projectSlug: string, projects: ProjectRecord[]) {
    const normalized = slugify(projectSlug);
    if (!normalized || normalized === 'inbox') return false;
    return !projects.some((project) => project.projectSlug === normalized);
  }

  private async ensureProjectExistsForSubmission(userId: string, workspaceSlug: string, projectSlug: string) {
    const normalizedProjectSlug = slugify(projectSlug);
    if (!normalizedProjectSlug || normalizedProjectSlug === 'inbox') return;

    const existing = await this.contentRepository.getProjectBySlug(userId, normalizedProjectSlug);
    if (existing?.enabled) return;

    await this.contentRepository.upsertProject(userId, {
      projectSlug: normalizedProjectSlug,
      displayName: displayNameFromProjectSlug(normalizedProjectSlug),
      workspaceSlug,
      repositories: [],
      defaultTags: [],
      enabled: true,
    });
  }

  private async resolveApprovalTurn(
    input: ConversationInput,
    userId: string,
    workspaceSlug: string,
    state: AgentConversationState,
  ): Promise<{
    intent: AgentConversationApprovalIntent;
    turn?: AgentDecisionTurn;
  }> {
    try {
      const turn = await this.requestAgentDecision(input, userId, workspaceSlug, state);
      const decision = turn.decision;
      if (decision.approvalIntent && decision.approvalIntent !== 'none') return { intent: decision.approvalIntent, turn };
      if (decision.action === 'cancel') return { intent: 'cancel', turn };
      if (state.pendingApproval === 'final_confirmation' && decision.action === 'submit') return { intent: 'approve', turn };
      return { intent: parseApprovalIntent(input.messageText), turn };
    } catch (error) {
      this.logger?.warn('conversation.agent.approval_fallback', {
        userId,
        workspaceSlug,
        pendingApproval: state.pendingApproval,
        ...serializeErrorForLog(error),
      });
    }
    return { intent: parseApprovalIntent(input.messageText) };
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
        pendingApproval: overrides?.pendingApproval || state.pendingApproval,
        selectedProjectSlug: overrides?.selectedProjectSlug || state.project.selectedProjectSlug,
        selectedFolderId: overrides?.selectedFolderId || state.folder.selectedFolderId,
        suggestedFolderPath: overrides?.suggestedFolderPath || state.folder.suggestedFolderPath,
        confidence: overrides?.confidence || state.confidence,
      },
    };
  }
}

function displayNameFromProjectSlug(projectSlug: string) {
  return projectSlug
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function serializeErrorForLog(error: unknown) {
  if (!(error instanceof Error)) {
    return { error: String(error) };
  }

  const baseFields: Record<string, unknown> = {
    errorName: error.name,
    error: error.message,
    errorStack: error.stack,
  };
  const errorRecord = error as Error & {
    cause?: unknown;
    status?: number;
    statusText?: string;
    responseBody?: string;
    endpoint?: string;
    provider?: unknown;
    model?: string;
  };

  if (errorRecord.cause instanceof Error) {
    baseFields.errorCause = errorRecord.cause.message;
    baseFields.errorCauseStack = errorRecord.cause.stack;
  } else if (errorRecord.cause !== undefined) {
    baseFields.errorCause = String(errorRecord.cause);
  }
  if (errorRecord.status !== undefined) baseFields.errorStatus = errorRecord.status;
  if (errorRecord.statusText !== undefined) baseFields.errorStatusText = errorRecord.statusText;
  if (errorRecord.responseBody !== undefined) baseFields.errorResponseBody = errorRecord.responseBody;
  if (errorRecord.endpoint !== undefined) baseFields.errorEndpoint = errorRecord.endpoint;
  if (errorRecord.provider !== undefined) baseFields.errorProvider = String(errorRecord.provider);
  if (errorRecord.model !== undefined) baseFields.errorModel = errorRecord.model;
  return baseFields;
}
