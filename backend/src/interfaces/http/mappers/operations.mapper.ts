import type { WorkspaceScope } from '../../../application/models/workspace-scope.models.js';
import type { ProcessAgentConversationInput } from '../../../application/use-cases/conversation/process-agent-conversation.use-case.js';
import type { AgentConversationBody } from '../dto/operations.dto.js';

export function toProcessAgentConversationInput(
  body: AgentConversationBody,
  userId: string,
  scope?: WorkspaceScope,
): ProcessAgentConversationInput {
  return {
    input: body,
    userId,
    workspaceSlug: scope?.workspaceSlug || 'default',
    projectSlug: scope?.projectSlug || undefined,
  };
}
