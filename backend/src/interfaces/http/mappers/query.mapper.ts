import { DEFAULT_PAGE_SIZE } from '../../../contracts/pagination.js';
import type { QueryInput } from '../../../contracts/query.js';
import type { WorkspaceScope } from '../../../application/models/workspace-scope.models.js';
import type { QueryRequest } from '../dto/query.dto.js';
import { normalizeScopeId } from '../http-helpers.js';

export function toQueryKnowledgeInput(
  query: QueryRequest,
  scope?: WorkspaceScope,
): QueryInput {
  return {
    query: query.query.trim(),
    status: query.status ?? 'open',
    limit: query.limit ?? 5,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
    projectId: normalizeScopeId(scope?.projectId),
    workspaceId: normalizeScopeId(scope?.workspaceId),
  };
}
