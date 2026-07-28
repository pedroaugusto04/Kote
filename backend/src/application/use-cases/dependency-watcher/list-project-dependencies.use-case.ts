import { Injectable, NotFoundException } from '@nestjs/common';

import type { ListProjectDependenciesResult, ProjectDependencyGroup } from '../../models/dependency-watcher.models.js';
import { DependencyWatcherRepository } from '../../ports/dependency-watcher/dependency-watcher.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';

@Injectable()
export class ListProjectDependenciesUseCase {
  constructor(
    private readonly dependencyWatcherRepository: DependencyWatcherRepository,
    private readonly contentRepository: ContentRepository,
  ) {}

  async execute(userId: string, projectId: string, projectSlug: string): Promise<ListProjectDependenciesResult> {
    const projects = await this.contentRepository.listProjects(userId);
    const project = projects.find((item) => item.id === projectId);
    if (!project) {
      throw new NotFoundException('project_not_found');
    }

    const workspaceSlug = project.workspaceSlug;
    if (!workspaceSlug) {
      throw new NotFoundException('workspace_not_found');
    }

    const workspace = await this.contentRepository.getWorkspaceBySlug(userId, workspaceSlug);
    if (!workspace) {
      throw new NotFoundException('workspace_not_found');
    }

    const projectRepositoryIds = project.repositories.map((repository) => repository.id);
    if (projectRepositoryIds.length === 0) {
      return { projectSlug, groups: [], total: 0 };
    }

    const monitoredRepositoryIds = new Set(
      await this.dependencyWatcherRepository.listMonitoredRepositoryIds(userId, workspace.id),
    );
    const scopedRepositoryIds = projectRepositoryIds.filter((repositoryId) => monitoredRepositoryIds.has(repositoryId));
    if (scopedRepositoryIds.length === 0) {
      return { projectSlug, groups: [], total: 0 };
    }

    const dependencies = await this.dependencyWatcherRepository.findByRepositoryIds(
      userId,
      workspace.id,
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
      groups,
      total: dependencies.length,
    };
  }
}
