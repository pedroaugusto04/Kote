import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import crypto from 'node:crypto';

import {
  agentConversationStateSchema,
  type AgentConversationState,
} from '../../../contracts/agent-conversation.js';
import { type ConversationInput } from '../../../contracts/conversation.js';
import { CredentialRecordStatus, IntegrationProvider, AgentConversationAction } from '../../../contracts/enums.js';
import { ingestPayloadSchema } from '../../../contracts/ingest.js';
import { slugify } from '../../../domain/strings.js';
import { currentDateTimeInTimeZone, nowIso } from '../../../domain/time.js';
import { AppLogger } from '../../../observability/logger.js';
import type { ProjectFolderRecord } from '../../models/repository-records.models.js';
import { ConversationAgentGateway, type ConversationAgentResponse } from '../../ports/conversation/conversation-agent.gateway.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { CredentialRepository } from '../../ports/integrations/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { ConversationStateRepository } from '../../ports/reminders/workflow-state.repository.js';
import { isCancel } from '../../utils/conversation-command.utils.js';
import { isConversationStateExpired } from '../../utils/conversation-state.utils.js';
import { buildProjectFolderTree } from '../../utils/project-folder.utils.js';
import { IngestEntryUseCase } from '../ingest/ingest-entry.use-case.js';
import { ConversationAgentPresenter } from './services/conversation-agent.presenter.js';
import { ConversationFolderResolutionService } from './services/conversation-folder-resolution.service.js';
import {
  buildAgentConversationPayload as buildAgentPayload,
  buildNextAgentConversationState,
  emptyAgentConversationState as EMPTY_AGENT_CONVERSATION_STATE,
  mediaFromInput as mediaFromConversationInput,
  resolveSelectedProjectSlug as resolveAgentSelectedProjectSlug,
  sanitizeExistingProjectSlug as sanitizeExistingAgentProjectSlug,
  serializeFolderTreeNode as serializeAgentFolderTreeNode,
} from './services/conversation-agent-state-machine.js';

type AgentConversationResult = {
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

type AgentDecisionTurn = {
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

  async execute(input: ConversationInput, userId: string, workspaceSlug = 'default', projectSlug?: string): Promise<AgentConversationResult> {
    const normalizedWorkspaceSlug = slugify(workspaceSlug) || 'default';
    await this.assertAgentEnabled(userId, normalizedWorkspaceSlug);

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
    const { candidateProjectSlug, candidateFolders, decision } = await this.requestAgentDecision(
      input,
      userId,
      workspaceSlug,
      state,
    );
    if (this.isEmptyAgentDraftAsk(decision)) {
      return this.reply(AgentConversationAction.Ask, this.presenter.couldNotUnderstand(), null, state);
    }

    const selectedProjectSlug = resolveAgentSelectedProjectSlug(decision.selectedProjectSlug, state);
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
      candidateFolders: foldersForDecision,
      reminderTimeZone: environment.reminderTimeZone,
    });
    await this.conversationStates.upsert(userId, workspaceSlug, key, nextState);
    this.logger?.info('conversation.agent.state.updated', {
      userId,
      workspaceSlug,
      conversationKey: key,
      action: decision.action,
      selectedProjectSlug: nextState.project.selectedProjectSlug,
      selectedFolderId: nextState.folder.selectedFolderId,
      suggestedFolderPath: nextState.folder.suggestedFolderPath,
      rawTextLength: nextState.draft.rawText.length,
      confidence: nextState.confidence,
    });

    if (!nextState.draft.rawText) {
      return this.reply(AgentConversationAction.Ask, this.presenter.couldNotUnderstand(), null, nextState);
    }
    if (decision.action !== 'cancel') {
      return this.submitState(input, userId, workspaceSlug, key, nextState);
    }

    return this.reply(AgentConversationAction.Ask, decision.replyText || this.presenter.needsOneMoreDetail(), null, nextState);
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
    return isConversationStateExpired(state.updatedAt, recordUpdatedAt);
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
        selectedProjectSlug: decision.selectedProjectSlug,
        selectedFolderId: decision.selectedFolderId,
        suggestedFolderPath: decision.suggestedFolderPath,
        placeInRoot: decision.placeInRoot,
        rawTextLength: decision.resolvedDraft.rawText.length,
        confidence: decision.confidence,
      });
      return { candidateProjectSlug, candidateFolders, decision };
    } catch (error) {
      this.logger?.error('conversation.agent.decision_failed', {
        userId,
        workspaceSlug,
        messageId: input.messageId,
        ...serializeErrorForLog(error),
      });
      throw error;
    }
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
      AgentConversationAction.Submit,
      this.presenter.noteSaved(ingestResult),
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

    const existing = await this.contentRepository.getProjectBySlug(userId, normalizedProjectSlug);
    if (existing?.enabled) return;

    const workspace = await this.contentRepository.getWorkspaceBySlug(userId, workspaceSlug);
    if (!workspace) return;

    await this.contentRepository.upsertProject(userId, {
      id: crypto.randomUUID(),
      projectSlug: normalizedProjectSlug,
      displayName: displayNameFromProjectSlug(normalizedProjectSlug),
      workspaceId: workspace.id,
      workspaceSlug,
      repositories: [],
      defaultTags: [],
      enabled: true,
      favorite: false,
    });
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
