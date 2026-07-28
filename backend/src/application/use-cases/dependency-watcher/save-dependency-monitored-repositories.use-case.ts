import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

import type { SaveDependencyMonitoredRepositoriesResult } from '../../models/dependency-watcher.models.js';
import { DependencyWatcherRepository } from '../../ports/dependency-watcher/dependency-watcher.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { GithubRepositoryResolutionService } from '../../services/integrations/github-repository-resolution.service.js';
import { ImportDependenciesFromGithubUseCase } from './import-dependencies-from-github.use-case.js';
import { MissingCredentialError } from '../../../contracts/enums.js';

@Injectable()
export class SaveDependencyMonitoredRepositoriesUseCase {
  constructor(
    private readonly dependencyWatcherRepository: DependencyWatcherRepository,
    private readonly contentRepository: ContentRepository,
    private readonly githubRepositoryResolution: GithubRepositoryResolutionService,
    private readonly importDependenciesFromGithubUseCase: ImportDependenciesFromGithubUseCase,
  ) {}

  async execute(
    userId: string,
    workspaceSlug: string,
    repositoryExternalIds: string[],
  ): Promise<SaveDependencyMonitoredRepositoriesResult> {
    const workspace = await this.contentRepository.getWorkspaceBySlug(userId, workspaceSlug);
    if (!workspace) {
      throw new NotFoundException('workspace_not_found');
    }

    const projects = await this.contentRepository.listProjects(userId);
    const workspaceProjects = projects.filter((project) => project.workspaceSlug === workspaceSlug);
    const linkedRepositoryIds = new Set(workspaceProjects.flatMap((project) => project.repositories.map((repo) => repo.id)));
    const linkedExternalIds = new Set(
      workspaceProjects.flatMap((project) => project.repositories.map((repo) => String(repo.externalId))),
    );

    const uniqueExternalIds = [...new Set(repositoryExternalIds.map((id) => String(id).trim()).filter(Boolean))];
    const invalidSelection = uniqueExternalIds.find((externalId) => !linkedExternalIds.has(externalId));
    if (invalidSelection) {
      throw new BadRequestException({
        code: 'invalid_dependency_repository_selection',
        details: { fieldErrors: { repositoryIds: 'Select only repositories linked to workspace projects.' } },
      });
    }

    const resolvedRepositories = uniqueExternalIds.length > 0
      ? await this.githubRepositoryResolution.resolveSelectedRepositories({
        userId,
        workspaceSlug,
        repositoryIds: uniqueExternalIds,
        missingCredentialError: MissingCredentialError.NotFound,
      })
      : [];

    const selectedRepositoryIds = resolvedRepositories
      .map((repository) => repository.id)
      .filter((repositoryId) => linkedRepositoryIds.has(repositoryId));

    const currentMonitoredIds = await this.dependencyWatcherRepository.listMonitoredRepositoryIds(userId, workspace.id);
    const removedRepositoryIds = currentMonitoredIds.filter((repositoryId) => !selectedRepositoryIds.includes(repositoryId));

    if (removedRepositoryIds.length > 0) {
      await this.dependencyWatcherRepository.deleteByRepositoryIds(userId, workspace.id, removedRepositoryIds);
    }

    await this.dependencyWatcherRepository.setMonitoredRepositories(userId, workspace.id, selectedRepositoryIds);

    const importResult = selectedRepositoryIds.length > 0
      ? await this.importDependenciesFromGithubUseCase.execute(userId, workspaceSlug, { repositoryIds: selectedRepositoryIds })
      : { jobId: randomUUID(), queued: 0, repositories: 0 };

    return {
      monitored: selectedRepositoryIds.length,
      import: importResult,
    };
  }
}
