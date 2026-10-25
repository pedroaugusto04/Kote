import type { WorkspaceScope } from '../../../application/models/workspace-scope.models.js';
import type { RunAskAiInput } from '../../../application/use-cases/query/run-ask-ai.use-case.js';
import type { AskRequest } from '../dto/ask.dto.js';
import { normalizeScopeId } from '../http-helpers.js';

export function toRunAskAiInput(body: AskRequest, userId: string, scope?: WorkspaceScope): RunAskAiInput {
  return {
    question: body.question,
    userId,
    scope: {
      projectId: normalizeScopeId(scope?.projectId),
      workspaceId: normalizeScopeId(scope?.workspaceId),
    },
    conversationId: body.conversationId,
    conversationHistory: body.conversationHistory,
  };
}
