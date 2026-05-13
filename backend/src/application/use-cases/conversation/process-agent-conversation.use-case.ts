import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import {
  agentConversationDraftSchema,
  agentConversationStateSchema,
  type AgentConversationApprovalIntent,
  type AgentConversationState,
} from '../../../contracts/agent-conversation.js';
import { type ConversationInput } from '../../../contracts/conversation.js';
import { CredentialRecordStatus, IntegrationProvider } from '../../../contracts/enums.js';
import { ingestPayloadSchema } from '../../../contracts/ingest.js';
import { slugify, trimText } from '../../../domain/strings.js';
import { currentDateTimeInTimeZone, normalizeDate, normalizeTime, nowIso } from '../../../domain/time.js';
import { AppLogger } from '../../../observability/logger.js';
import type { ProjectFolderRecord, ProjectRecord } from '../../models/repository-records.models.js';
import { ConversationAgentGateway, type ConversationAgentFolderContext, type ConversationAgentResponse } from '../../ports/conversation-agent.gateway.js';
import { ContentRepository } from '../../ports/content.repository.js';
import { CredentialRepository } from '../../ports/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/runtime-environment.port.js';
import { ConversationStateRepository } from '../../ports/workflow-state.repository.js';
import { isCancel, isConfirm, isReject } from '../../utils/conversation-command.utils.js';
import { buildConversationIngestPayload } from '../../utils/conversation-payload.utils.js';
import { buildProjectFolderTree, folderSlugFromDisplayName } from '../../utils/project-folder.utils.js';
import { IngestEntryUseCase } from '../ingest/ingest-entry.use-case.js';
import { CreateProjectFolderUseCase } from '../projects/create-project-folder.use-case.js';

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

const emptyAgentConversationState: AgentConversationState = agentConversationStateSchema.parse({});

@Injectable()
export class ProcessAgentConversationUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly conversationStates: ConversationStateRepository,
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly createProjectFolderUseCase: CreateProjectFolderUseCase,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly conversationAgentGateway: ConversationAgentGateway,
    private readonly credentials?: CredentialRepository,
    private readonly logger?: AppLogger,
  ) {}

  async execute(input: ConversationInput, userId: string, workspaceSlug = 'default'): Promise<AgentConversationResult> {
    const normalizedWorkspaceSlug = slugify(workspaceSlug) || 'default';
    await this.assertAgentEnabled(userId, normalizedWorkspaceSlug);

    const key = `agent:${input.groupId}:${input.senderId}`;
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
      return this.reply('ask', 'Envie o texto da nota para eu organizar o projeto e a pasta antes de salvar.', null, state);
    }
    if (!messageText && input.hasMedia) {
      const nextState = agentConversationStateSchema.parse({
        ...state,
        media: mediaFromInput(input, state),
        lastQuestion: 'Recebi a midia. Me diga o que e em qual projeto devo salvar.',
        lastUserMessage: '',
        lastAgentAction: 'ask',
        updatedAt: nowIso(),
      });
      await this.conversationStates.upsert(userId, normalizedWorkspaceSlug, key, nextState);
      return this.reply('ask', nextState.lastQuestion, null, nextState);
    }
    if (isCancel(messageText)) {
      await this.conversationStates.clear(userId, normalizedWorkspaceSlug, key);
      return this.reply('cancel', 'Captura cancelada. Envie uma nova nota quando quiser.', null, emptyAgentConversationState);
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

    const selectedProjectSlug = resolveSelectedProjectSlug(decision.selectedProjectSlug, state, projects);
    const foldersForDecision = selectedProjectSlug && selectedProjectSlug !== 'inbox'
      ? selectedProjectSlug === candidateProjectSlug
        ? candidateFolders
        : await this.contentRepository.listProjectFolders(userId, selectedProjectSlug)
      : [];
    const nextState = buildNextState(state, messageText, mediaFromInput(input, state), decision, projects, foldersForDecision, environment.reminderTimeZone);
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
      return this.reply('ask', 'Nao consegui entender a nota ainda. Reenvie a mensagem com mais informações.', null, nextState);
    }
    if (!nextState.project.selectedProjectSlug) {
      return this.reply('ask', buildProjectPrompt(decision.replyText, projects), null, nextState);
    }
    if (nextState.pendingApproval === 'final_confirmation') {
      const finalState = {
        ...nextState,
        lastQuestion: buildFinalConfirmationPrompt(nextState),
        lastAgentAction: 'confirm' as const,
        updatedAt: nowIso(),
      };
      await this.conversationStates.upsert(userId, normalizedWorkspaceSlug, key, finalState);
      return this.reply('confirm', finalState.lastQuestion, null, finalState);
    }

    return this.reply('ask', decision.replyText || 'Preciso de mais um detalhe antes de salvar.', null, nextState);
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
    return parsed?.success ? parsed.data : emptyAgentConversationState;
  }

  private async requestAgentDecision(
    input: ConversationInput,
    userId: string,
    workspaceSlug: string,
    state: AgentConversationState,
  ): Promise<AgentDecisionTurn> {
    const projects = (await this.contentRepository.listProjects(userId))
      .filter((project) => project.enabled && project.workspaceSlug === workspaceSlug);
    const candidateProjectSlug = sanitizeProjectSlug(state.project.selectedProjectSlug, projects);
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
            aliases: project.aliases,
            defaultTags: project.defaultTags,
          })),
          candidateProjectSlug,
          candidateFolders: buildProjectFolderTree(candidateFolders).map(serializeFolderTreeNode),
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
        error: error instanceof Error ? error.message : String(error),
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
      return this.reply('cancel', 'Nota descartada. Nenhum registro foi criado.', null, emptyAgentConversationState);
    }
    if (intent !== 'approve') {
      if (approval.turn) {
        const messageText = String(input.messageText || '').trim();
        const environment = this.environmentProvider.read();
        const selectedProjectSlug = resolveSelectedProjectSlug(approval.turn.decision.selectedProjectSlug, state, approval.turn.projects);
        const foldersForDecision = selectedProjectSlug && selectedProjectSlug !== 'inbox'
          ? selectedProjectSlug === approval.turn.candidateProjectSlug
            ? approval.turn.candidateFolders
            : await this.contentRepository.listProjectFolders(userId, selectedProjectSlug)
          : [];
        const nextState = buildNextState(
          state,
          messageText,
          mediaFromInput(input, state),
          approval.turn.decision,
          approval.turn.projects,
          foldersForDecision,
          environment.reminderTimeZone,
        );
        await this.conversationStates.upsert(userId, workspaceSlug, key, nextState);
        if (!nextState.draft.rawText) {
          return this.reply('ask', 'Nao consegui entender a nota ainda. Reenvie a mensagem com mais informações.', null, nextState);
        }
        if (!nextState.project.selectedProjectSlug) {
          return this.reply('ask', buildProjectPrompt(approval.turn.decision.replyText, approval.turn.projects), null, nextState);
        }
        if (nextState.pendingApproval === 'final_confirmation') {
          const finalState = {
            ...nextState,
            lastQuestion: buildFinalConfirmationPrompt(nextState),
            lastAgentAction: 'confirm' as const,
            updatedAt: nowIso(),
          };
          await this.conversationStates.upsert(userId, workspaceSlug, key, finalState);
          return this.reply('confirm', finalState.lastQuestion, null, finalState);
        }
        return this.reply('ask', approval.turn.decision.replyText || 'Preciso de mais um detalhe antes de salvar.', null, nextState);
      }
      return this.reply('confirm', buildFinalConfirmationPrompt(state), null, state);
    }

    const folderId = await this.resolveFolderIdForSubmission(userId, state);
    const payload = buildAgentConversationPayload(input, state, this.environmentProvider.read().reminderTimeZone);
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
      'Nota salva com sucesso.',
      payload,
      emptyAgentConversationState,
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
      return { intent: parserApprovalIntent(input.messageText), turn };
    } catch (error) {
      this.logger?.warn('conversation.agent.approval_fallback', {
        userId,
        workspaceSlug,
        pendingApproval: state.pendingApproval,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return { intent: parserApprovalIntent(input.messageText) };
  }

  private async resolveFolderIdForSubmission(userId: string, state: AgentConversationState) {
    if (!state.project.selectedProjectSlug || state.project.selectedProjectSlug === 'inbox') return '';
    if (state.folder.placeInRoot || state.folder.suggestedFolderPath.length === 0) return state.folder.selectedFolderId;
    if (state.folder.selectedFolderId) return state.folder.selectedFolderId;

    let parentFolderId = '';
    let lastFolderId = '';
    for (const segment of state.folder.suggestedFolderPath) {
      const displayName = trimText(segment);
      if (!displayName) continue;
      const folders = await this.contentRepository.listProjectFolders(userId, state.project.selectedProjectSlug);
      const folderSlug = folderSlugFromDisplayName(displayName);
      const existing = folders.find((folder) => folder.parentFolderId === (parentFolderId || null) && folder.folderSlug === folderSlug);
      if (existing) {
        parentFolderId = existing.id;
        lastFolderId = existing.id;
        continue;
      }
      const created = await this.createProjectFolderUseCase.execute({
        projectSlug: state.project.selectedProjectSlug,
        displayName,
        parentFolderId: parentFolderId || undefined,
      }, userId);
      parentFolderId = created.folder.id;
      lastFolderId = created.folder.id;
    }
    return lastFolderId;
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

function buildNextState(
  current: AgentConversationState,
  messageText: string,
  media: AgentConversationState['media'],
  decision: ConversationAgentResponse,
  projects: ProjectRecord[],
  candidateFolders: ProjectFolderRecord[],
  reminderTimeZone: string,
) {
  const selectedProjectSlug = resolveSelectedProjectSlug(decision.selectedProjectSlug, current, projects);
  const draft = agentConversationDraftSchema.parse({
    ...current.draft,
    ...decision.resolvedDraft,
    rawText: trimText(decision.resolvedDraft.rawText, trimText(current.draft.rawText, messageText)),
    reminderDate: normalizeDate(decision.resolvedDraft.reminderDate || current.draft.reminderDate || '', reminderTimeZone),
    reminderTime: normalizeTime(decision.resolvedDraft.reminderTime || current.draft.reminderTime || ''),
    tags: [...new Set([...(current.draft.tags || []), ...(decision.resolvedDraft.tags || [])].map((tag) => slugify(tag)).filter(Boolean))],
  });
  const folderResolution = resolveFolderSelection({
    selectedProjectSlug,
    selectedFolderId: resolveSelectedFolderId(decision, current, selectedProjectSlug),
    suggestedFolderPath: resolveSuggestedFolderPath(decision, current, selectedProjectSlug),
    placeInRoot: decision.placeInRoot,
    folders: selectedProjectSlug && selectedProjectSlug !== 'inbox' ? candidateFolders : [],
  });
  const readyForFinalConfirmation = Boolean(draft.rawText && selectedProjectSlug && decision.action !== 'ask');

  return agentConversationStateSchema.parse({
    draft,
    media,
    project: { selectedProjectSlug },
    folder: {
      selectedFolderId: folderResolution.selectedFolderId,
      suggestedFolderPath: folderResolution.suggestedFolderPath,
      placeInRoot: folderResolution.placeInRoot,
    },
    pendingApproval: !selectedProjectSlug
      ? 'none'
      : decision.pendingApproval === 'final_confirmation' || decision.action === 'submit' || readyForFinalConfirmation
          ? 'final_confirmation'
          : 'none',
    lastQuestion: decision.replyText || current.lastQuestion,
    lastUserMessage: messageText,
    lastAgentAction: decision.action,
    confidence: decision.confidence,
    updatedAt: nowIso(),
  });
}

function serializeFolderTreeNode(folder: Awaited<ReturnType<typeof buildProjectFolderTree>>[number]): ConversationAgentFolderContext {
  return {
    id: folder.id,
    displayName: folder.displayName,
    fullSlugPath: folder.fullSlugPath,
    children: folder.children.map(serializeFolderTreeNode),
  };
}

function buildProjectPrompt(replyText: string, projects: ProjectRecord[]) {
  const options = ['inbox', ...projects.map((project) => `${project.projectSlug} (${project.displayName})`)];
  return `${replyText || 'Qual projeto devo usar para esta nota?'}\n\nProjetos disponiveis: ${options.join(', ')}`;
}

function buildFinalConfirmationPrompt(state: AgentConversationState) {
  const folderText = state.folder.placeInRoot
    ? 'raiz do projeto'
    : state.folder.selectedFolderId
      ? 'pasta existente selecionada'
      : state.folder.suggestedFolderPath.length
        ? `${state.folder.suggestedFolderPath.join(' / ')} (nova, sera criada ao salvar)`
        : 'raiz do projeto';
  return [
    'Confirme o salvamento da nota:',
    `Texto: ${state.draft.rawText}`,
    `Projeto: ${state.project.selectedProjectSlug || 'inbox'}`,
    `Pasta: ${folderText}`,
    `Tipo: ${state.draft.kind}`,
    `Lembrete: ${state.draft.reminderDate ? `${state.draft.reminderDate}${state.draft.reminderTime ? ` ${state.draft.reminderTime}` : ''}` : 'sem lembrete'}`,
    state.draft.tags.length ? `Tags: ${state.draft.tags.join(', ')}` : '',
    '',
    'Responda "sim" para salvar ou "nao" para descartar.',
  ].filter(Boolean).join('\n');
}

function resolveFolderSelection(input: {
  selectedProjectSlug: string;
  selectedFolderId: string;
  suggestedFolderPath: string[];
  placeInRoot: boolean;
  folders: ProjectFolderRecord[];
}) {
  if (!input.selectedProjectSlug || input.selectedProjectSlug === 'inbox') {
    return { selectedFolderId: '', suggestedFolderPath: [], placeInRoot: true };
  }
  if (input.placeInRoot) {
    return { selectedFolderId: '', suggestedFolderPath: [], placeInRoot: true };
  }
  const folderById = input.selectedFolderId
    ? input.folders.find((folder) => folder.id === input.selectedFolderId) || null
    : null;
  if (folderById) {
    return {
      selectedFolderId: folderById.id,
      suggestedFolderPath: folderById.fullSlugPath.split('/').filter(Boolean),
      placeInRoot: false,
    };
  }

  const path = input.suggestedFolderPath.map((segment) => trimText(segment)).filter(Boolean);
  if (path.length === 0) return { selectedFolderId: '', suggestedFolderPath: [], placeInRoot: true };

  const fullSlugPath = path.map((segment) => folderSlugFromDisplayName(segment)).join('/');
  const exactMatch = input.folders.find((folder) => folder.fullSlugPath === fullSlugPath);
  if (exactMatch) {
    return { selectedFolderId: exactMatch.id, suggestedFolderPath: path, placeInRoot: false };
  }
  return { selectedFolderId: '', suggestedFolderPath: path, placeInRoot: false };
}

function sanitizeProjectSlug(value: string, projects: ProjectRecord[]) {
  const normalized = slugify(value);
  if (!normalized) return '';
  if (normalized === 'inbox') return 'inbox';
  return projects.some((project) => project.projectSlug === normalized) ? normalized : '';
}

function resolveSelectedProjectSlug(value: string, current: AgentConversationState, projects: ProjectRecord[]) {
  const selected = sanitizeProjectSlug(value, projects);
  if (selected) return selected;
  if (String(value || '').trim()) return '';
  return sanitizeProjectSlug(current.project.selectedProjectSlug, projects);
}

function resolveSelectedFolderId(decision: ConversationAgentResponse, current: AgentConversationState, selectedProjectSlug: string) {
  if (decision.selectedFolderId || decision.placeInRoot) return decision.selectedFolderId;
  if (selectedProjectSlug !== current.project.selectedProjectSlug) return '';
  if (decision.suggestedFolderPath.length > 0) return '';
  return current.folder.selectedFolderId;
}

function resolveSuggestedFolderPath(decision: ConversationAgentResponse, current: AgentConversationState, selectedProjectSlug: string) {
  if (decision.placeInRoot) return [];
  if (decision.suggestedFolderPath.length > 0) return decision.suggestedFolderPath;
  if (selectedProjectSlug !== current.project.selectedProjectSlug) return [];
  if (decision.selectedFolderId) return [];
  return current.folder.suggestedFolderPath;
}

function parserApprovalIntent(value: string): AgentConversationApprovalIntent {
  if (isCancel(value)) return 'cancel';
  if (isConfirm(value)) return 'approve';
  if (isReject(value)) return 'reject';
  return 'unclear';
}

function buildAgentConversationPayload(input: ConversationInput, state: AgentConversationState, reminderTimeZone: string) {
  return buildConversationIngestPayload({
    input,
    correlationPrefix: 'wpp-agent',
    projectSlug: state.project.selectedProjectSlug || 'inbox',
    rawText: state.draft.rawText,
    title: state.draft.title || '',
    media: mediaForAttachment(state) ? state.media : undefined,
    kind: state.draft.kind,
    canonicalType: state.draft.canonicalType,
    importance: state.draft.importance,
    tags: state.draft.tags,
    reminderDate: state.draft.reminderDate,
    reminderTime: state.draft.reminderTime,
    reminderTimeZone,
    metadata: {},
  });
}

function mediaFromInput(input: ConversationInput, state: AgentConversationState) {
  if (input.hasMedia && input.media.fileName) return input.media;
  return state.media;
}

function mediaForAttachment(state: AgentConversationState) {
  return Boolean(state.media.fileName && state.media.dataBase64);
}
