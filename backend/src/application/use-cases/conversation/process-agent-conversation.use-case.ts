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
  sanitizeProjectSlug as sanitizeAgentProjectSlug,
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
    const state = await this.loadState(userId, normalizedWorkspaceSlug, key);
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
    if (state.pendingApproval === 'final_confirmation') {
      return this.handleFinalConfirmation(input, userId, normalizedWorkspaceSlug, key, state);
    }

    const environment = this.environmentProvider.read();
    const { projects, candidateProjectSlug, candidateFolders, decision } = await this.requestAgentDecision(
      input,
      userId,
      normalizedWorkspaceSlug,
      state,
    );

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
    await this.conversationStates.upsert(userId, normalizedWorkspaceSlug, key, nextState);
    this.logger?.info('conversation.agent.state.updated', {
      userId,
      workspaceSlug: normalizedWorkspaceSlug,
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
      const finalState = {
        ...nextState,
        lastQuestion: this.presenter.finalConfirmationPrompt(nextState),
        lastAgentAction: 'confirm' as const,
        updatedAt: nowIso(),
      };
      await this.conversationStates.upsert(userId, normalizedWorkspaceSlug, key, finalState);
      return this.reply('confirm', finalState.lastQuestion, null, finalState);
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
    return parsed?.success ? parsed.data : EMPTY_AGENT_CONVERSATION_STATE;
  }

  private async requestAgentDecision(
    input: ConversationInput,
    userId: string,
    workspaceSlug: string,
    state: AgentConversationState,
  ): Promise<AgentDecisionTurn> {
    const projects = (await this.contentRepository.listProjects(userId))
      .filter((project) => project.enabled && project.workspaceSlug === workspaceSlug);
    const candidateProjectSlug = sanitizeAgentProjectSlug(state.project.selectedProjectSlug, projects);
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
      if (approval.turn) {
        const messageText = String(input.messageText || '').trim();
        const environment = this.environmentProvider.read();
        const selectedProjectSlug = resolveAgentSelectedProjectSlug(approval.turn.decision.selectedProjectSlug, state, approval.turn.projects);
        const foldersForDecision = selectedProjectSlug && selectedProjectSlug !== 'inbox'
          ? selectedProjectSlug === approval.turn.candidateProjectSlug
            ? approval.turn.candidateFolders
            : await this.contentRepository.listProjectFolders(userId, selectedProjectSlug)
          : [];
        const nextState = buildNextAgentConversationState({
          current: state,
          messageText,
          media: mediaFromConversationInput(input, state),
          decision: approval.turn.decision,
          projects: approval.turn.projects,
          candidateFolders: foldersForDecision,
          reminderTimeZone: environment.reminderTimeZone,
        });
        await this.conversationStates.upsert(userId, workspaceSlug, key, nextState);
        if (!nextState.draft.rawText) {
          return this.reply('ask', this.presenter.couldNotUnderstand(), null, nextState);
        }
        if (!nextState.project.selectedProjectSlug) {
          return this.reply('ask', this.presenter.projectPrompt(approval.turn.decision.replyText, approval.turn.projects), null, nextState);
        }
        if (nextState.pendingApproval === 'final_confirmation') {
          const finalState = {
            ...nextState,
            lastQuestion: this.presenter.finalConfirmationPrompt(nextState),
            lastAgentAction: 'confirm' as const,
            updatedAt: nowIso(),
          };
          await this.conversationStates.upsert(userId, workspaceSlug, key, finalState);
          return this.reply('confirm', finalState.lastQuestion, null, finalState);
        }
        return this.reply('ask', approval.turn.decision.replyText || this.presenter.needsOneMoreDetail(), null, nextState);
      }
      return this.reply('confirm', this.presenter.finalConfirmationPrompt(state), null, state);
    }

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
