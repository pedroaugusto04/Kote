import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { DependencyWatcherRepository } from '../../ports/dependency-watcher/dependency-watcher.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import { RabbitMqDependencyCheckQueuePublisher } from '../../../infrastructure/queue/rabbitmq-dependency-check-queue.publisher.js';

@Injectable()
export class CheckProjectDependenciesUseCase {
  constructor(
    private readonly dependencyWatcherRepository: DependencyWatcherRepository,
    private readonly contentRepository: ContentRepository,
    private readonly dependencyCheckQueuePublisher: RabbitMqDependencyCheckQueuePublisher,
    private readonly logger: AppLogger,
  ) {}

  async execute(userId: string, projectId: string, projectSlug: string): Promise<{ jobId: string; queued: number }> {
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
      return { jobId: randomUUID(), queued: 0 };
    }

    const monitoredRepositoryIds = new Set(
      await this.dependencyWatcherRepository.listMonitoredRepositoryIds(userId, workspace.id),
    );
    const scopedRepositoryIds = projectRepositoryIds.filter((repositoryId) => monitoredRepositoryIds.has(repositoryId));
    if (scopedRepositoryIds.length === 0) {
      return { jobId: randomUUID(), queued: 0 };
    }

    const dependencies = await this.dependencyWatcherRepository.findByRepositoryIdsEnabled(
      userId,
      workspace.id,
      scopedRepositoryIds,
    );

    const workspaceEnabled = await this.dependencyWatcherRepository.isWorkspaceEnabled(workspace.id);
    if (!workspaceEnabled) {
      this.logger.warn('dependency_check.workspace_disabled', { workspaceId: workspace.id });
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
      workspaceId: workspace.id,
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
