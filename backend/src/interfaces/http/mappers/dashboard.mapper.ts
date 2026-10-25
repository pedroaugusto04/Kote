import type { WorkspaceScope } from '../../../application/models/workspace-scope.models.js';
import type { AiAnalyticsQuery } from '../dto/dashboard.dto.js';
import { normalizeScopeId } from '../http-helpers.js';

export function toAiTokenAnalyticsFilter(
  query?: AiAnalyticsQuery,
  scope?: WorkspaceScope,
) {
  return {
    workspaceId: normalizeScopeId(scope?.workspaceId),
    projectId: normalizeScopeId(scope?.projectId),
    startDate: query?.startDate,
    endDate: query?.endDate,
    model: query?.model,
    provider: query?.provider,
  };
}
