import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { DependencyWatcherRepository } from '../../ports/dependency-watcher/dependency-watcher.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import { DependencyCheckQueuePublisher } from '../../ports/dependency-watcher/dependency-check-queue.publisher.js';

@Injectable()
export class CheckDependencyUseCase {
  constructor(
    private readonly dependencyWatcherRepository: DependencyWatcherRepository,
    private readonly contentRepository: ContentRepository,
    private readonly dependencyCheckQueuePublisher: DependencyCheckQueuePublisher,
    private readonly logger: AppLogger,
  ) {}

  async execute(userId: string, dependencyId: string, projectId: string, projectSlug: string, workspaceId?: string): Promise<{ jobId: string; queued: number }> {
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

    const dependency = await this.dependencyWatcherRepository.findById(userId, resolvedWorkspaceId, dependencyId);
    if (!dependency) {
      throw new NotFoundException('dependency_not_found');
    }

    const workspaceEnabled = await this.dependencyWatcherRepository.isWorkspaceEnabled(resolvedWorkspaceId);
    if (!workspaceEnabled) {
      this.logger.warn('dependency_check.workspace_disabled', { workspaceId: resolvedWorkspaceId });
      return { jobId: randomUUID(), queued: 0 };
    }

    const jobId = randomUUID();

    // Publish job to queue for async processing
    await this.dependencyCheckQueuePublisher.publish({
      jobId,
      userId,
      projectId,
      projectSlug,
      workspaceId: resolvedWorkspaceId,
      repositoryIds: dependency.repositoryId ? [dependency.repositoryId] : [],
      dependencyIds: [dependency.id],
    });

    this.logger.info('dependency_check.queued', {
      jobId,
      projectId,
      dependencyId,
      dependencyCount: 1,
    });

    return { jobId, queued: 1 };
  }
}
