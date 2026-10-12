import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { DependencyWatcherRepository } from '../../ports/dependency-watcher/dependency-watcher.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import { DependencyCheckQueuePublisher } from '../../ports/dependency-watcher/dependency-check-queue.publisher.js';

@Injectable()
export class CheckProjectDependenciesUseCase {
  constructor(
    private readonly dependencyWatcherRepository: DependencyWatcherRepository,
    private readonly contentRepository: ContentRepository,
    private readonly dependencyCheckQueuePublisher: DependencyCheckQueuePublisher,
    private readonly logger: AppLogger,
  ) {}

  async execute(userId: string, projectId: string, projectSlug: string, workspaceId?: string): Promise<{ jobId: string; queued: number }> {
    const project = await this.contentRepository.getProjectById(userId, projectId);
    if (!project) {
      throw new NotFoundException('project_not_found');
    }

    const workspaceSlug = project.workspaceSlug;
    const resolvedWorkspaceId = workspaceId
      || project.workspaceId
      || (workspaceSlug ? (await this.contentRepository.getWorkspaceBySlug(userId, workspaceSlug))?.id : undefined);
    if (!resolvedWorkspaceId) {
      throw new NotFoundException('workspace_not_found');
    }

    const projectRepositoryIds = project.repositories.map((repository) => repository.id);
    if (projectRepositoryIds.length === 0) {
      return { jobId: randomUUID(), queued: 0 };
    }

    const monitoredRepositoryIds = new Set(
      await this.dependencyWatcherRepository.listMonitoredRepositoryIds(userId, resolvedWorkspaceId),
    );
    const scopedRepositoryIds = projectRepositoryIds.filter((repositoryId) => monitoredRepositoryIds.has(repositoryId));
    if (scopedRepositoryIds.length === 0) {
      return { jobId: randomUUID(), queued: 0 };
    }

    const dependencies = await this.dependencyWatcherRepository.findByRepositoryIdsEnabled(
      userId,
      resolvedWorkspaceId,
      scopedRepositoryIds,
    );

    this.logger.info('dependency_check.dependencies_found', {
      userId,
      workspaceId: resolvedWorkspaceId,
      projectRepositoryIds: projectRepositoryIds.length,
      monitoredRepositoryIds: monitoredRepositoryIds.size,
      scopedRepositoryIds: scopedRepositoryIds.length,
      dependenciesFound: dependencies.length,
    });

    const workspaceEnabled = await this.dependencyWatcherRepository.isWorkspaceEnabled(resolvedWorkspaceId);
    if (!workspaceEnabled) {
      this.logger.warn('dependency_check.workspace_disabled', { workspaceId: resolvedWorkspaceId });
      return { jobId: randomUUID(), queued: 0 };
    }

    const jobId = randomUUID();
    const dependencyIds = dependencies.map((dep) => dep.id);

    // Publish job to queue for async processing
    await this.dependencyCheckQueuePublisher.publish({
      jobId,
      userId,
      projectId,
      projectSlug,
      workspaceId: resolvedWorkspaceId,
      repositoryIds: scopedRepositoryIds,
      dependencyIds,
    });

    this.logger.info('dependency_check.queued', {
      jobId,
      projectId,
      dependencyCount: dependencyIds.length,
    });

    return { jobId, queued: dependencyIds.length };
  }
}
