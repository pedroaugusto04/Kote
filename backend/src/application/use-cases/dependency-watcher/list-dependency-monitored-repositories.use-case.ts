import { Injectable } from '@nestjs/common';

import type { ListDependencyMonitoredRepositoriesResult, MonitoredRepositoryItem } from '../../models/dependency-watcher.models.js';
import { DependencyWatcherRepository } from '../../ports/dependency-watcher/dependency-watcher.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';
import { GithubRepositoryResolutionService } from '../../services/integrations/github-repository-resolution.service.js';
import { MissingCredentialError } from '../../../contracts/enums.js';

@Injectable()
export class ListDependencyMonitoredRepositoriesUseCase {
  constructor(
    private readonly dependencyWatcherRepository: DependencyWatcherRepository,
    private readonly contentRepository: ContentRepository,
    private readonly githubRepositoryResolution: GithubRepositoryResolutionService,
    private readonly scopeResolver: WorkspaceScopeResolver,
  ) {}

  async execute(userId: string, workspaceSlug: string): Promise<ListDependencyMonitoredRepositoriesResult> {
    const workspace = await this.scopeResolver.resolveWorkspace(userId, workspaceSlug);
    const workspaceProjects = await this.contentRepository.listProjectsByWorkspace(userId, workspace.id);
    const linkedRepositories = new Map<string, { fullName: string; projectNames: string[] }>();

    for (const project of workspaceProjects) {
      for (const repository of project.repositories) {
        const existing = linkedRepositories.get(repository.id) || {
          fullName: repository.fullName,
          projectNames: [],
        };
        if (!existing.projectNames.includes(project.displayName)) {
          existing.projectNames.push(project.displayName);
        }
        linkedRepositories.set(repository.id, existing);
      }
    }

    const monitoredRepositoryIds = new Set(
      await this.dependencyWatcherRepository.listMonitoredRepositoryIds(userId, workspace.id),
    );

    if (linkedRepositories.size === 0) {
      return { workspaceSlug, repositories: [] };
    }

    let accessibleRepositories = [] as Awaited<ReturnType<GithubRepositoryResolutionService['listAccessibleRepositories']>>;
    try {
      accessibleRepositories = await this.githubRepositoryResolution.listAccessibleRepositories({
        userId,
        workspaceSlug,
        missingCredentialError: MissingCredentialError.NotFound,
      });
    } catch {
      accessibleRepositories = [];
    }

    const accessibleByFullName = new Map(
      accessibleRepositories.map((repository) => [repository.fullName.toLowerCase(), repository]),
    );

    const repositories: MonitoredRepositoryItem[] = [];
    for (const [repositoryId, linked] of linkedRepositories.entries()) {
      const accessible = accessibleByFullName.get(linked.fullName.toLowerCase());
      if (!accessible) continue;

      repositories.push({
        id: String(accessible.id),
        fullName: linked.fullName,
        private: Boolean(accessible.private),
        monitored: monitoredRepositoryIds.has(repositoryId),
        projectNames: linked.projectNames,
      });
    }

    repositories.sort((left, right) => left.fullName.localeCompare(right.fullName));

    return { workspaceSlug, repositories };
  }
}
