import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import {
  agentConversationDraftSchema,
  agentConversationStateSchema,
  type AgentConversationState,
} from '../../../contracts/agent-conversation.js';
import { type ConversationInput } from '../../../contracts/conversation.js';
import { CredentialRecordStatus, IntegrationProvider } from '../../../contracts/enums.js';
import { ingestPayloadSchema } from '../../../contracts/ingest.js';
import { slugify, trimText } from '../../../domain/strings.js';
import { normalizeDate, normalizeTime, nowIso } from '../../../domain/time.js';
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
  action: 'ask' | 'confirm' | 'create_and_confirm' | 'cancel' | 'submit';
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
  ) {}

  async execute(input: ConversationInput, userId: string, workspaceSlug = 'default'): Promise<AgentConversationResult> {
    const normalizedWorkspaceSlug = slugify(workspaceSlug) || 'default';
    await this.assertAgentEnabled(userId, normalizedWorkspaceSlug);

    const key = `agent:${input.groupId}:${input.senderId}`;
    const state = await this.loadState(userId, normalizedWorkspaceSlug, key);
    const messageText = String(input.messageText || '').trim();

    if (!messageText && !input.hasMedia) {
      return this.reply('ask', 'Envie o texto da nota para eu organizar o projeto e a pasta antes de salvar.', null, state);
    }
    if (isCancel(messageText)) {
      await this.conversationStates.clear(userId, normalizedWorkspaceSlug, key);
      return this.reply('cancel', 'Captura cancelada. Envie uma nova nota quando quiser.', null, emptyAgentConversationState);
    }
    if (state.pendingApproval === 'folder_create') {
      return this.handleFolderApproval(input, userId, normalizedWorkspaceSlug, key, state);
    }
    if (state.pendingApproval === 'final_confirmation') {
      return this.handleFinalConfirmation(input, userId, normalizedWorkspaceSlug, key, state);
    }

    const projects = (await this.contentRepository.listProjects(userId))
      .filter((project) => project.enabled && project.workspaceSlug === normalizedWorkspaceSlug);
    const candidateProjectSlug = sanitizeProjectSlug(state.project.selectedProjectSlug, projects);
    const candidateFolders = candidateProjectSlug && candidateProjectSlug !== 'inbox'
      ? await this.contentRepository.listProjectFolders(userId, candidateProjectSlug)
      : [];

    const environment = this.environmentProvider.read();
    const decision = await this.conversationAgentGateway.decide(
      {
        conversationAiProvider: environment.conversationAiProvider,
        conversationAiBaseUrl: environment.conversationAiBaseUrl,
        conversationAiModel: environment.conversationAiModel,
        conversationAiApiKey: environment.conversationAiApiKey,
      },
      {
        messageText,
        currentState: state,
        availableProjects: projects.map((project) => ({
          projectSlug: project.projectSlug,
          displayName: project.displayName,
          aliases: project.aliases,
          defaultTags: project.defaultTags,
        })),
        candidateProjectSlug,
        candidateFolders: buildProjectFolderTree(candidateFolders).map(serializeFolderTreeNode),
      },
    );
    if (!decision) throw new BadRequestException('conversation_agent_unavailable');

    const selectedProjectSlug = sanitizeProjectSlug(decision.selectedProjectSlug, projects);
    const foldersForDecision = selectedProjectSlug && selectedProjectSlug !== 'inbox'
      ? selectedProjectSlug === candidateProjectSlug
        ? candidateFolders
        : await this.contentRepository.listProjectFolders(userId, selectedProjectSlug)
      : [];
    const nextState = buildNextState(state, messageText, decision, projects, foldersForDecision, environment.reminderTimeZone);
    await this.conversationStates.upsert(userId, normalizedWorkspaceSlug, key, nextState);

    if (!nextState.draft.rawText) {
      return this.reply('ask', 'Nao consegui entender a nota ainda. Reenvie a mensagem com mais contexto.', null, nextState);
    }
    if (!nextState.project.selectedProjectSlug) {
      return this.reply('ask', buildProjectPrompt(decision.replyText, projects), null, nextState);
    }
    if (nextState.pendingApproval === 'folder_create') {
      return this.reply('confirm', decision.replyText || buildFolderApprovalPrompt(nextState), null, nextState);
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

  private async handleFolderApproval(
    input: ConversationInput,
    userId: string,
    workspaceSlug: string,
    key: string,
    state: AgentConversationState,
  ): Promise<AgentConversationResult> {
    if (isConfirm(input.messageText)) {
      const nextState = agentConversationStateSchema.parse({
        ...state,
        folder: { ...state.folder, folderApproved: true },
        pendingApproval: 'final_confirmation',
        lastUserMessage: input.messageText,
        updatedAt: nowIso(),
      });
      const summary = buildFinalConfirmationPrompt(nextState);
      const persisted = { ...nextState, lastQuestion: summary, lastAgentAction: 'confirm' as const, updatedAt: nowIso() };
      await this.conversationStates.upsert(userId, workspaceSlug, key, persisted);
      return this.reply('create_and_confirm', summary, null, persisted);
    }
    if (isReject(input.messageText)) {
      const nextState = agentConversationStateSchema.parse({
        ...state,
        folder: { ...state.folder, selectedFolderId: '', suggestedFolderPath: [], placeInRoot: true, folderApproved: false },
        pendingApproval: 'final_confirmation',
        lastUserMessage: input.messageText,
        updatedAt: nowIso(),
      });
      const summary = buildFinalConfirmationPrompt(nextState);
      const persisted = { ...nextState, lastQuestion: summary, lastAgentAction: 'confirm' as const, updatedAt: nowIso() };
      await this.conversationStates.upsert(userId, workspaceSlug, key, persisted);
      return this.reply('confirm', summary, null, persisted);
    }
    return this.reply('confirm', `${buildFolderApprovalPrompt(state)}\n\nResponda "sim" para aprovar a pasta ou "nao" para salvar na raiz do projeto.`, null, state);
  }

  private async handleFinalConfirmation(
    input: ConversationInput,
    userId: string,
    workspaceSlug: string,
    key: string,
    state: AgentConversationState,
  ): Promise<AgentConversationResult> {
    if (isReject(input.messageText)) {
      await this.conversationStates.clear(userId, workspaceSlug, key);
      return this.reply('cancel', 'Nota descartada. Nenhum registro foi criado.', null, emptyAgentConversationState);
    }
    if (!isConfirm(input.messageText)) {
      return this.reply('confirm', buildFinalConfirmationPrompt(state), null, state);
    }

    const folderId = await this.resolveFolderIdForSubmission(userId, state);
    const payload = buildAgentConversationPayload(input, state, this.environmentProvider.read().reminderTimeZone);
    const ingestResult = await this.ingestEntryUseCase.execute(payload, userId, workspaceSlug, { folderId: folderId || undefined });
    await this.conversationStates.clear(userId, workspaceSlug, key);
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

  private async resolveFolderIdForSubmission(userId: string, state: AgentConversationState) {
    if (!state.project.selectedProjectSlug || state.project.selectedProjectSlug === 'inbox') return '';
    if (state.folder.placeInRoot || state.folder.suggestedFolderPath.length === 0) return state.folder.selectedFolderId;
    if (state.folder.selectedFolderId) return state.folder.selectedFolderId;
    if (!state.folder.folderApproved) return '';

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
  decision: ConversationAgentResponse,
  projects: ProjectRecord[],
  candidateFolders: ProjectFolderRecord[],
  reminderTimeZone: string,
) {
  const selectedProjectSlug = sanitizeProjectSlug(decision.selectedProjectSlug, projects);
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
    selectedFolderId: decision.selectedFolderId,
    suggestedFolderPath: decision.suggestedFolderPath,
    folders: selectedProjectSlug && selectedProjectSlug !== 'inbox' ? candidateFolders : [],
  });

  return agentConversationStateSchema.parse({
    draft,
    project: { selectedProjectSlug },
    folder: {
      selectedFolderId: folderResolution.selectedFolderId,
      suggestedFolderPath: folderResolution.suggestedFolderPath,
      placeInRoot: folderResolution.placeInRoot,
      folderApproved: current.folder.folderApproved && samePath(current.folder.suggestedFolderPath, folderResolution.suggestedFolderPath),
    },
    pendingApproval: !selectedProjectSlug
      ? 'none'
      : folderResolution.needsApproval
        ? 'folder_create'
        : decision.pendingApproval === 'final_confirmation'
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

function buildFolderApprovalPrompt(state: AgentConversationState) {
  return `Sugestao de pasta para ${state.project.selectedProjectSlug}: ${state.folder.suggestedFolderPath.join(' / ')}. Posso criar essa estrutura antes de salvar a nota?`;
}

function buildFinalConfirmationPrompt(state: AgentConversationState) {
  const folderText = state.folder.placeInRoot
    ? 'raiz do projeto'
    : state.folder.selectedFolderId
      ? 'pasta existente selecionada'
      : state.folder.suggestedFolderPath.length
        ? state.folder.suggestedFolderPath.join(' / ')
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
  folders: ProjectFolderRecord[];
}) {
  if (!input.selectedProjectSlug || input.selectedProjectSlug === 'inbox') {
    return { selectedFolderId: '', suggestedFolderPath: [], placeInRoot: true, needsApproval: false };
  }
  const folderById = input.selectedFolderId
    ? input.folders.find((folder) => folder.id === input.selectedFolderId) || null
    : null;
  if (folderById) {
    return {
      selectedFolderId: folderById.id,
      suggestedFolderPath: folderById.fullSlugPath.split('/').filter(Boolean),
      placeInRoot: false,
      needsApproval: false,
    };
  }

  const path = input.suggestedFolderPath.map((segment) => trimText(segment)).filter(Boolean);
  if (path.length === 0) return { selectedFolderId: '', suggestedFolderPath: [], placeInRoot: true, needsApproval: false };

  const fullSlugPath = path.map((segment) => folderSlugFromDisplayName(segment)).join('/');
  const exactMatch = input.folders.find((folder) => folder.fullSlugPath === fullSlugPath);
  if (exactMatch) {
    return { selectedFolderId: exactMatch.id, suggestedFolderPath: path, placeInRoot: false, needsApproval: false };
  }
  return { selectedFolderId: '', suggestedFolderPath: path, placeInRoot: false, needsApproval: true };
}

function sanitizeProjectSlug(value: string, projects: ProjectRecord[]) {
  const normalized = slugify(value);
  if (!normalized) return '';
  if (normalized === 'inbox') return 'inbox';
  return projects.some((project) => project.projectSlug === normalized) ? normalized : '';
}

function buildAgentConversationPayload(input: ConversationInput, state: AgentConversationState, reminderTimeZone: string) {
  return buildConversationIngestPayload({
    input,
    correlationPrefix: 'wpp-agent',
    projectSlug: state.project.selectedProjectSlug || 'inbox',
    rawText: state.draft.rawText,
    title: state.draft.title || '',
    media: input.hasMedia ? input.media : undefined,
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

function samePath(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

