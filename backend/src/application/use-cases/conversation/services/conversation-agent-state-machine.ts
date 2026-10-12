import {
  agentConversationStateSchema,
  type AgentConversationState,
} from '../../../../contracts/agent-conversation.js';
import type { ConversationInput } from '../../../../contracts/conversation.js';
import type { ProjectFolderRecord, ProjectRecord } from '../../../models/repository-records.models.js';
import { buildProjectFolderTree } from '../../../utils/content/project-folder.utils.js';
import {
  toNextAgentConversationState,
  toFolderTreeNode,
  toAgentConversationPayload,
  toMediaFromInput,
  toSanitizedProjectSlug,
  toExistingProjectSlug,
  toSelectedProjectSlug,
  toReplyAgentConversationState,
  toClarifyAgentConversationState,
  toCaptureAgentConversationState,
  toPendingClarificationContext,
  toAgentConversationResult,
} from '../../../mappers/conversation.mapper.js';

export const emptyAgentConversationState: AgentConversationState = agentConversationStateSchema.parse({});

export const buildNextAgentConversationState = toNextAgentConversationState;
export const buildReplyAgentConversationState = toReplyAgentConversationState;
export const buildClarifyAgentConversationState = toClarifyAgentConversationState;
export const buildCaptureAgentConversationState = toCaptureAgentConversationState;
export const buildPendingClarificationContext = toPendingClarificationContext;
export const serializeFolderTreeNode = toFolderTreeNode;
export const sanitizeProjectSlug = toSanitizedProjectSlug;
export const sanitizeExistingProjectSlug = toExistingProjectSlug;
export const resolveSelectedProjectSlug = toSelectedProjectSlug;
export const buildAgentConversationPayload = toAgentConversationPayload;
export const mediaFromInput = toMediaFromInput;
export const buildAgentConversationResult = toAgentConversationResult;
