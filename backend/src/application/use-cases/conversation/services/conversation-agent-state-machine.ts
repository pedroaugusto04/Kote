import {
  agentConversationDraftSchema,
  agentConversationStateSchema,
  type AgentConversationApprovalIntent,
  type AgentConversationState,
} from '../../../../contracts/agent-conversation.js';
import type { ConversationInput } from '../../../../contracts/conversation.js';
import { ingestPayloadSchema } from '../../../../contracts/ingest.js';
import { slugify, trimText } from '../../../../domain/strings.js';
import { normalizeDate, normalizeTime, nowIso } from '../../../../domain/time.js';
import type { ProjectFolderRecord, ProjectRecord } from '../../../models/repository-records.models.js';
import type { ConversationAgentFolderContext, ConversationAgentResponse } from '../../../ports/conversation-agent.gateway.js';
import { isCancel, isConfirm, isReject } from '../../../utils/conversation-command.utils.js';
import { buildConversationIngestPayload } from '../../../utils/conversation-payload.utils.js';
import { buildProjectFolderTree, folderSlugFromDisplayName } from '../../../utils/project-folder.utils.js';

export const emptyAgentConversationState: AgentConversationState = agentConversationStateSchema.parse({});

export function buildNextAgentConversationState(input: {
  current: AgentConversationState;
  messageText: string;
  media: AgentConversationState['media'];
  decision: ConversationAgentResponse;
  projects: ProjectRecord[];
  candidateFolders: ProjectFolderRecord[];
  reminderTimeZone: string;
}) {
  const selectedProjectSlug = resolveSelectedProjectSlug(input.decision.selectedProjectSlug, input.current, input.projects);
  const draft = agentConversationDraftSchema.parse({
    ...input.current.draft,
    ...input.decision.resolvedDraft,
    rawText: trimText(input.decision.resolvedDraft.rawText, trimText(input.current.draft.rawText, input.messageText)),
    reminderDate: normalizeDate(input.decision.resolvedDraft.reminderDate || input.current.draft.reminderDate || '', input.reminderTimeZone),
    reminderTime: normalizeTime(input.decision.resolvedDraft.reminderTime || input.current.draft.reminderTime || ''),
    tags: [...new Set([...(input.current.draft.tags || []), ...(input.decision.resolvedDraft.tags || [])].map((tag) => slugify(tag)).filter(Boolean))],
  });
  const folderResolution = resolveFolderSelection({
    selectedProjectSlug,
    selectedFolderId: resolveSelectedFolderId(input.decision, input.current, selectedProjectSlug),
    suggestedFolderPath: resolveSuggestedFolderPath(input.decision, input.current, selectedProjectSlug),
    placeInRoot: input.decision.placeInRoot,
    folders: selectedProjectSlug && selectedProjectSlug !== 'inbox' ? input.candidateFolders : [],
  });
  const readyForFinalConfirmation = Boolean(draft.rawText && selectedProjectSlug && input.decision.action !== 'ask');

  return agentConversationStateSchema.parse({
    draft,
    media: input.media,
    project: { selectedProjectSlug },
    folder: {
      selectedFolderId: folderResolution.selectedFolderId,
      suggestedFolderPath: folderResolution.suggestedFolderPath,
      placeInRoot: folderResolution.placeInRoot,
    },
    pendingApproval: !selectedProjectSlug
      ? 'none'
      : input.decision.pendingApproval === 'final_confirmation' || input.decision.action === 'submit' || readyForFinalConfirmation
          ? 'final_confirmation'
          : 'none',
    lastQuestion: input.decision.replyText || input.current.lastQuestion,
    lastUserMessage: input.messageText,
    lastAgentAction: input.decision.action,
    confidence: input.decision.confidence,
    updatedAt: nowIso(),
  });
}

export function serializeFolderTreeNode(folder: Awaited<ReturnType<typeof buildProjectFolderTree>>[number]): ConversationAgentFolderContext {
  return {
    id: folder.id,
    displayName: folder.displayName,
    fullSlugPath: folder.fullSlugPath,
    children: folder.children.map(serializeFolderTreeNode),
  };
}

export function sanitizeProjectSlug(value: string, projects: ProjectRecord[]) {
  const normalized = slugify(value);
  if (!normalized) return '';
  if (normalized === 'inbox') return 'inbox';
  return projects.some((project) => project.projectSlug === normalized) ? normalized : '';
}

export function resolveSelectedProjectSlug(value: string, current: AgentConversationState, projects: ProjectRecord[]) {
  const selected = sanitizeProjectSlug(value, projects);
  if (selected) return selected;
  if (String(value || '').trim()) return '';
  return sanitizeProjectSlug(current.project.selectedProjectSlug, projects);
}

export function parseApprovalIntent(value: string): AgentConversationApprovalIntent {
  if (isCancel(value)) return 'cancel';
  if (isConfirm(value)) return 'approve';
  if (isReject(value)) return 'reject';
  return 'unclear';
}

export function buildAgentConversationPayload(input: ConversationInput, state: AgentConversationState, reminderTimeZone: string) {
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

export function mediaFromInput(input: ConversationInput, state: AgentConversationState) {
  if (input.hasMedia && input.media.fileName) return input.media;
  return state.media;
}

export function parseAgentPayload(payload: ReturnType<typeof buildAgentConversationPayload>) {
  return ingestPayloadSchema.parse(payload);
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

function mediaForAttachment(state: AgentConversationState) {
  return Boolean(state.media.fileName && state.media.dataBase64);
}
