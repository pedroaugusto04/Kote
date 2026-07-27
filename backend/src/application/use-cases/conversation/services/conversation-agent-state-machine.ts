import {
  agentConversationStateSchema,
  type AgentConversationState,
} from '../../../../contracts/agent-conversation.js';
import type { ConversationInput } from '../../../../contracts/conversation.js';
import type { ProjectFolderRecord, ProjectRecord } from '../../../models/repository-records.models.js';
import type { ConversationAgentFolderContext, ConversationAgentResponse } from '../../../ports/conversation/conversation-agent.gateway.js';
import { buildProjectFolderTree } from '../../../utils/content/project-folder.utils.js';
import {
  toNextAgentConversationState,
  toFolderTreeNode,
  toAgentConversationPayload,
  toMediaFromInput,
  toSanitizedProjectSlug,
  toExistingProjectSlug,
  toSelectedProjectSlug,
} from '../../../mappers/conversation.mapper.js';

export const emptyAgentConversationState: AgentConversationState = agentConversationStateSchema.parse({});

export const buildNextAgentConversationState = toNextAgentConversationState;
export const serializeFolderTreeNode = toFolderTreeNode;
export const sanitizeProjectSlug = toSanitizedProjectSlug;
export const sanitizeExistingProjectSlug = toExistingProjectSlug;
export const resolveSelectedProjectSlug = toSelectedProjectSlug;
export const buildAgentConversationPayload = toAgentConversationPayload;
export const mediaFromInput = toMediaFromInput;
