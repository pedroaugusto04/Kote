import { Injectable } from '@nestjs/common';

import type {
  ListProjectDependenciesResult,
  ProjectDependencyGroup,
  ProjectDependencyScopeInput,
} from '../../models/dependency-watcher.models.js';
import { DependencyWatcherRepository } from '../../ports/dependency-watcher/dependency-watcher.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';

@Injectable()
export class ListProjectDependenciesUseCase {
  constructor(
    private readonly dependencyWatcherRepository: DependencyWatcherRepository,
    private readonly contentRepository: ContentRepository,
    private readonly scopeResolver: WorkspaceScopeResolver,
  ) {}

  async execute(input: ProjectDependencyScopeInput): Promise<ListProjectDependenciesResult> {
    const { userId, projectId, projectSlug, workspaceId } = input;

    const { project, workspaceId: resolvedWorkspaceId, workspaceSlug } = await this.scopeResolver.resolveProjectWorkspace(
      userId,
      projectId,
      workspaceId,
    );

    const projectRepositoryIds = project.repositories.map((repository) => repository.id);
    if (projectRepositoryIds.length === 0) {
      return { projectSlug, workspaceSlug, groups: [], total: 0 };
    }

    const monitoredRepositoryIds = new Set(
      await this.dependencyWatcherRepository.listMonitoredRepositoryIds(userId, resolvedWorkspaceId),
    );
    const scopedRepositoryIds = projectRepositoryIds.filter((repositoryId) => monitoredRepositoryIds.has(repositoryId));
    if (scopedRepositoryIds.length === 0) {
      return { projectSlug, workspaceSlug, groups: [], total: 0 };
    }

    const dependencies = await this.dependencyWatcherRepository.findByRepositoryIds(
      userId,
      resolvedWorkspaceId,
      scopedRepositoryIds,
    );

    const repositoryNameById = new Map(
      project.repositories.map((repository) => [repository.id, repository.fullName]),
    );
    const grouped = new Map<string, ProjectDependencyGroup>();

    for (const dependency of dependencies) {
      const repositoryId = dependency.repositoryId || '';
      if (!repositoryId) continue;

      const group = grouped.get(repositoryId) || {
        repositoryId,
        repositoryFullName: repositoryNameById.get(repositoryId) || repositoryId,
        dependencies: [],
      };

      group.dependencies.push({
        id: dependency.id,
        ecosystem: dependency.ecosystem,
        packageName: dependency.packageName,
        currentVersion: dependency.currentVersion,
        latestSeenVersion: dependency.latestSeenVersion,
        lastCheckedAt: dependency.lastCheckedAt?.toISOString() || null,
        lastUrgency: dependency.lastUrgency,
        enabled: dependency.enabled,
      });
      grouped.set(repositoryId, group);
    }

    const groups = [...grouped.values()]
      .map((group) => ({
        ...group,
        dependencies: group.dependencies.sort((left, right) => left.packageName.localeCompare(right.packageName)),
      }))
      .sort((left, right) => left.repositoryFullName.localeCompare(right.repositoryFullName));

    return {
      projectSlug,
      workspaceSlug,
      groups,
      total: dependencies.length,
    };
  }
}
