import type {
  CheckDependencyInput,
  ProjectDependencyScopeInput,
} from '../../../application/models/dependency-watcher.models.js';
import type { WorkspaceScope } from '../../../application/models/workspace-scope.models.js';
import type {
  CheckDependencyBody,
  ImportDependenciesBody,
  SaveMonitoredRepositoriesBody,
} from '../dto/dependency-watcher.dto.js';

export function toMonitoredRepositoryIds(body: SaveMonitoredRepositoriesBody): string[] {
  return body.repositoryIds || [];
}

export function toImportDependenciesOptions(body: ImportDependenciesBody) {
  return {
    projectIds: body.projectIds,
    repositoryIds: body.repositoryIds,
  };
}

export function toCheckProjectDependenciesInput(
  userId: string,
  scope: WorkspaceScope,
): ProjectDependencyScopeInput {
  return {
    userId,
    projectId: scope.projectId!,
    projectSlug: scope.projectSlug!,
    workspaceId: scope.workspaceId,
  };
}

export function toCheckDependencyInput(
  body: CheckDependencyBody,
  userId: string,
  scope: WorkspaceScope,
): CheckDependencyInput {
  return {
    userId,
    dependencyId: body.dependencyId,
    projectId: scope.projectId!,
    projectSlug: scope.projectSlug!,
    workspaceId: scope.workspaceId,
  };
}
