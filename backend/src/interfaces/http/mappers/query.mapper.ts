import { queryInputSchema } from '../../../contracts/query.js';
import type { WorkspaceScope } from '../../../application/models/workspace-scope.models.js';
import type { QueryRequest } from '../dto/query.dto.js';
import { normalizeScopeId } from '../http-helpers.js';

export function toQueryKnowledgeInput(
  query: QueryRequest,
  scope?: WorkspaceScope,
) {
  return queryInputSchema.parse({
    query: query.query,
    status: query.status,
    limit: query.limit,
    page: query.page,
    pageSize: query.pageSize,
    projectId: normalizeScopeId(scope?.projectId),
    workspaceId: normalizeScopeId(scope?.workspaceId),
  });
}
