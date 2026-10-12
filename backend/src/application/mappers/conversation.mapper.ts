import {
  agentConversationDraftSchema,
  agentConversationStateSchema,
  type AgentConversationState,
  type ConversationAgentDecision,
  type ConversationAgentFolderContext,
} from '../../contracts/agent-conversation.js';
import type { ConversationInput } from '../../contracts/conversation.js';
import { AgentConversationAction } from '../../contracts/enums.js';
import { normalizeMultiline, slugify, trimText } from '../../domain/strings.js';
import { nowIso } from '../../domain/time.js';
import type { ProjectFolderRecord, ProjectRecord } from '../models/repository-records.models.js';
import { buildConversationIngestPayload } from '../utils/conversation/conversation-payload.utils.js';
import { folderSlugFromDisplayName } from '../utils/content/project-folder.utils.js';
import { getCorrelationPrefix, getSourceSystem, resolveSourceChannel } from '../utils/integration/source-channel.utils.js';

export const emptyAgentConversationState: AgentConversationState = agentConversationStateSchema.parse({});

export function toPendingClarificationContext(state: AgentConversationState) {
  const hasPendingClarification =
    state.lastAgentAction === AgentConversationAction.Ask && Boolean(state.lastQuestion.trim());
  if (!hasPendingClarification) return undefined;

  return {
    originalRequest: state.draft.rawText || state.lastUserMessage,
    question: state.lastQuestion,
    draft: state.draft,
    projectSlug: state.project.selectedProjectSlug || undefined,
    selectedFolderId: state.folder.selectedFolderId || undefined,
    suggestedFolderPath: state.folder.suggestedFolderPath,
  };
}

export function toReplyAgentConversationState(
  current: AgentConversationState,
  userMessage: string,
  agentReply: string,
): AgentConversationState {
  const newTurn = {
    userMessage,
    agentReply,
    action: AgentConversationAction.Answer,
  };
  const updatedTurns = [...(current.turns || []), newTurn].slice(-5);

  return agentConversationStateSchema.parse({
    ...emptyAgentConversationState,
    project: {
      selectedProjectSlug: current.project.selectedProjectSlug || '',
    },
    turns: updatedTurns,
    updatedAt: nowIso(),
  });
}

export function toClarifyAgentConversationState(
  current: AgentConversationState,
  userMessage: string,
  decision: ConversationAgentDecision,
  clarificationText: string,
): AgentConversationState {
  return agentConversationStateSchema.parse({
    ...current,
    turns: current.turns || [],
    draft: {
      rawText: decision.resolvedDraft.rawText || current.draft.rawText || userMessage,
      title: decision.resolvedDraft.title || current.draft.title,
      kind: decision.resolvedDraft.kind !== 'note' ? decision.resolvedDraft.kind : current.draft.kind,
      canonicalType:
        decision.resolvedDraft.canonicalType !== 'event'
          ? decision.resolvedDraft.canonicalType
          : current.draft.canonicalType,
      importance:
        decision.resolvedDraft.importance !== 'low'
          ? decision.resolvedDraft.importance
          : current.draft.importance,
      tags: decision.resolvedDraft.tags.length ? decision.resolvedDraft.tags : current.draft.tags,
      reminderAt: decision.resolvedDraft.reminderAt || current.draft.reminderAt,
    },
    project: {
      selectedProjectSlug: decision.selectedProjectSlug || current.project.selectedProjectSlug,
    },
    folder: {
      selectedFolderId: decision.selectedFolderId || current.folder.selectedFolderId,
      suggestedFolderPath: decision.suggestedFolderPath.length
        ? decision.suggestedFolderPath
        : current.folder.suggestedFolderPath,
      placeInRoot: decision.placeInRoot || current.folder.placeInRoot,
    },
    lastQuestion: clarificationText,
    lastUserMessage: userMessage,
    lastAgentAction: 'ask',
    updatedAt: nowIso(),
  });
}

export function toCaptureAgentConversationState(
  input: ConversationInput,
  current: AgentConversationState,
  decision: ConversationAgentDecision,
  hasPendingClarification: boolean,
): AgentConversationState {
  const decisionRawText = String(decision.resolvedDraft?.rawText || '').trim();
  const hasPendingMedia = Boolean(current.media.fileName || current.media.dataBase64);
  const continuesPendingAction =
    hasPendingClarification &&
    (!decisionRawText ||
      decisionRawText === current.draft.rawText.trim() ||
      (hasPendingMedia && !current.draft.rawText.trim()));
  const pendingState = continuesPendingAction ? current : emptyAgentConversationState;
  const userMessage = String(input.messageText || '').trim();
  const rawText = decisionRawText || pendingState.draft.rawText || userMessage;
  const selectedProjectSlug =
    toSelectedProjectSlug(decision.selectedProjectSlug, pendingState) || (rawText ? 'inbox' : '');

  const isInbox = !selectedProjectSlug || selectedProjectSlug === 'inbox';
  return agentConversationStateSchema.parse({
    ...current,
    media: toMediaFromInput(input, pendingState),
    project: {
      selectedProjectSlug,
    },
    folder: {
      selectedFolderId: isInbox ? '' : decision.selectedFolderId || pendingState.folder.selectedFolderId,
      suggestedFolderPath: isInbox
        ? []
        : decision.suggestedFolderPath.length
          ? decision.suggestedFolderPath
          : pendingState.folder.suggestedFolderPath,
      placeInRoot: isInbox ? true : Boolean(decision.placeInRoot || pendingState.folder.placeInRoot),
    },
    draft: {
      rawText,
      title: decision.resolvedDraft?.title || '',
      kind: decision.resolvedDraft.kind || pendingState.draft.kind || 'note',
      canonicalType: decision.resolvedDraft.canonicalType || pendingState.draft.canonicalType || 'knowledge',
      importance: decision.resolvedDraft.importance || pendingState.draft.importance || 'normal',
      tags: decision.resolvedDraft.tags.length ? decision.resolvedDraft.tags : pendingState.draft.tags,
      reminderAt: decision.resolvedDraft.reminderAt || pendingState.draft.reminderAt || null,
    },
    confidence: decision.confidence,
    lastUserMessage: userMessage,
    lastAgentAction: 'confirm',
    updatedAt: nowIso(),
  });
}

export function toNextAgentConversationState(input: {
  current: AgentConversationState;
  messageText: string;
  media: AgentConversationState['media'];
  decision: ConversationAgentDecision;
  candidateFolders: ProjectFolderRecord[];
  reminderTimeZone: string;
}): AgentConversationState {
  const selectedProjectSlugFromDecision = toSelectedProjectSlug(input.decision.selectedProjectSlug, input.current);
  const draft = agentConversationDraftSchema.parse({
    ...input.current.draft,
    ...input.decision.resolvedDraft,
    rawText: normalizeMultiline(input.decision.resolvedDraft.rawText || normalizeMultiline(input.current.draft.rawText || input.messageText)),
    reminderAt: input.decision.resolvedDraft.reminderAt || input.current.draft.reminderAt || '',
    tags: [...new Set([...(input.current.draft.tags || []), ...(input.decision.resolvedDraft.tags || [])].map((tag) => slugify(tag)).filter(Boolean))],
  });
  const selectedProjectSlug = selectedProjectSlugFromDecision || (draft.rawText ? 'inbox' : '');
  const folderResolution = resolveFolderSelection({
    selectedProjectSlug,
    selectedFolderId: resolveSelectedFolderId(input.decision, input.current, selectedProjectSlug),
    suggestedFolderPath: resolveSuggestedFolderPath(input.decision, input.current, selectedProjectSlug),
    placeInRoot: input.decision.placeInRoot,
    folders: selectedProjectSlug && selectedProjectSlug !== 'inbox' ? input.candidateFolders : [],
  });

  const newTurn = {
    userMessage: input.messageText,
    agentReply: input.decision.replyText || '',
    action: input.decision.action,
  };
  const updatedTurns = [...(input.current.turns || []), newTurn].slice(-5);

  return agentConversationStateSchema.parse({
    draft,
    media: input.media,
    project: { selectedProjectSlug },
    folder: {
      selectedFolderId: folderResolution.selectedFolderId,
      suggestedFolderPath: folderResolution.suggestedFolderPath,
      placeInRoot: folderResolution.placeInRoot,
    },
    lastQuestion: input.decision.replyText || input.current.lastQuestion,
    lastUserMessage: input.messageText,
    lastAgentAction: input.decision.action,
    confidence: input.decision.confidence,
    turns: updatedTurns,
    updatedAt: nowIso(),
  });
}

export function toFolderTreeNode(folder: any): ConversationAgentFolderContext {
  return {
    id: folder.id,
    displayName: folder.displayName,
    fullSlugPath: folder.fullSlugPath,
    children: folder.children.map(toFolderTreeNode),
  };
}

export function toAgentConversationPayload(input: ConversationInput, state: AgentConversationState, reminderTimeZone: string) {
  const sourceChannel = resolveSourceChannel({
    senderId: input.senderId,
    chatId: input.chatId,
  });
  
  return buildConversationIngestPayload({
    input,
    correlationPrefix: getCorrelationPrefix(sourceChannel),
    sourceChannel,
    sourceSystem: getSourceSystem(sourceChannel),
    projectSlug: state.project.selectedProjectSlug || 'inbox',
    rawText: state.draft.rawText,
    title: state.draft.title || '',
    media: mediaForAttachment(state) ? state.media : undefined,
    kind: state.draft.kind,
    canonicalType: state.draft.canonicalType,
    importance: state.draft.importance,
    tags: state.draft.tags,
    reminderAt: state.draft.reminderAt,
    reminderTimeZone,
    metadata: {},
  });
}

export function toMediaFromInput(input: ConversationInput, state: AgentConversationState) {
  if (input.hasMedia && input.media.fileName) return input.media;
  return state.media;
}

export function toSanitizedProjectSlug(value: string): string {
  const normalized = slugify(value);
  if (!normalized) return '';
  return normalized;
}

export function toExistingProjectSlug(value: string, projects: ProjectRecord[]): string {
  const normalized = toSanitizedProjectSlug(value);
  if (!normalized) return '';
  if (normalized === 'inbox') return 'inbox';
  return projects.some((project) => project.projectSlug === normalized) ? normalized : '';
}

export function toSelectedProjectSlug(value: string, current: AgentConversationState): string {
  const selected = toSanitizedProjectSlug(value);
  if (selected) return selected;
  if (String(value || '').trim()) return '';
  return toSanitizedProjectSlug(current.project.selectedProjectSlug);
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

  const leafDisplayName = path[path.length - 1];
  const leafSlug = folderSlugFromDisplayName(leafDisplayName);
  const leafMatch = input.folders.find((folder) => folder.folderSlug === leafSlug);
  if (leafMatch) {
    return {
      selectedFolderId: leafMatch.id,
      suggestedFolderPath: leafMatch.fullSlugPath.split('/').filter(Boolean),
      placeInRoot: false,
    };
  }

  return { selectedFolderId: '', suggestedFolderPath: path, placeInRoot: false };
}

function resolveSelectedFolderId(decision: ConversationAgentDecision, current: AgentConversationState, selectedProjectSlug: string): string {
  if (decision.selectedFolderId || decision.placeInRoot) return decision.selectedFolderId;
  if (selectedProjectSlug !== current.project.selectedProjectSlug) return '';
  if (decision.suggestedFolderPath.length > 0) return '';
  return current.folder.selectedFolderId;
}

function resolveSuggestedFolderPath(decision: ConversationAgentDecision, current: AgentConversationState, selectedProjectSlug: string): string[] {
  if (decision.placeInRoot) return [];
  if (decision.suggestedFolderPath.length > 0) return decision.suggestedFolderPath;
  if (selectedProjectSlug !== current.project.selectedProjectSlug) return [];
  if (decision.selectedFolderId) return [];
  return current.folder.suggestedFolderPath;
}

function mediaForAttachment(state: AgentConversationState): boolean {
  return Boolean(state.media.fileName && state.media.dataBase64);
}

export function toAgentConversationResult(input: {
  action: AgentConversationAction;
  replyText: string;
  state: AgentConversationState;
  payload?: any;
  ingestResult?: any;
  answerContext?: any;
  overrides?: {
    selectedProjectSlug?: string;
    selectedFolderId?: string;
    suggestedFolderPath?: string[];
    confidence?: AgentConversationState['confidence'];
  };
}) {
  return {
    action: input.action,
    replyText: input.replyText,
    payload: input.payload ?? null,
    ingestResult: input.ingestResult,
    answerContext: input.answerContext,
    agent: {
      mode: 'agent' as const,
      selectedProjectSlug: input.overrides?.selectedProjectSlug || input.state.project.selectedProjectSlug,
      selectedFolderId: input.overrides?.selectedFolderId || input.state.folder.selectedFolderId,
      suggestedFolderPath: input.overrides?.suggestedFolderPath || input.state.folder.suggestedFolderPath,
      confidence: input.overrides?.confidence || input.state.confidence,
    },
  };
}
