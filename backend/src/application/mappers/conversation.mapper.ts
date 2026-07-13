import {
  agentConversationDraftSchema,
  agentConversationStateSchema,
  type AgentConversationState,
} from '../../contracts/agent-conversation.js';
import type { ConversationInput } from '../../contracts/conversation.js';
import { SourceChannel } from '../../contracts/enums.js';
import { normalizeMultiline, slugify, trimText } from '../../domain/strings.js';
import { nowIso } from '../../domain/time.js';
import type { ProjectFolderRecord, ProjectRecord } from '../models/repository-records.models.js';
import type { ConversationAgentFolderContext, ConversationAgentResponse } from '../ports/conversation/conversation-agent.gateway.js';
import { buildConversationIngestPayload } from '../utils/conversation-payload.utils.js';
import { folderSlugFromDisplayName } from '../utils/project-folder.utils.js';
import { getCorrelationPrefix, getSourceSystem, resolveSourceChannel } from '../utils/source-channel.utils.js';

export function toNextAgentConversationState(input: {
  current: AgentConversationState;
  messageText: string;
  media: AgentConversationState['media'];
  decision: ConversationAgentResponse;
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

function resolveSelectedFolderId(decision: ConversationAgentResponse, current: AgentConversationState, selectedProjectSlug: string): string {
  if (decision.selectedFolderId || decision.placeInRoot) return decision.selectedFolderId;
  if (selectedProjectSlug !== current.project.selectedProjectSlug) return '';
  if (decision.suggestedFolderPath.length > 0) return '';
  return current.folder.selectedFolderId;
}

function resolveSuggestedFolderPath(decision: ConversationAgentResponse, current: AgentConversationState, selectedProjectSlug: string): string[] {
  if (decision.placeInRoot) return [];
  if (decision.suggestedFolderPath.length > 0) return decision.suggestedFolderPath;
  if (selectedProjectSlug !== current.project.selectedProjectSlug) return [];
  if (decision.selectedFolderId) return [];
  return current.folder.suggestedFolderPath;
}

function mediaForAttachment(state: AgentConversationState): boolean {
  return Boolean(state.media.fileName && state.media.dataBase64);
}
