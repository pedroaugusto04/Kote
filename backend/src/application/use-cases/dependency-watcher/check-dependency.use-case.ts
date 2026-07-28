import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { DependencyWatcherRepository } from '../../ports/dependency-watcher/dependency-watcher.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import { RabbitMqDependencyCheckQueuePublisher } from '../../../infrastructure/queue/rabbitmq-dependency-check-queue.publisher.js';

@Injectable()
export class CheckDependencyUseCase {
  constructor(
    private readonly dependencyWatcherRepository: DependencyWatcherRepository,
    private readonly contentRepository: ContentRepository,
    private readonly dependencyCheckQueuePublisher: RabbitMqDependencyCheckQueuePublisher,
    private readonly logger: AppLogger,
  ) {}

  async execute(userId: string, dependencyId: string, projectId: string, projectSlug: string): Promise<{ jobId: string; queued: number }> {
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

    const dependency = await this.dependencyWatcherRepository.findById(userId, workspace.id, dependencyId);
    if (!dependency) {
      throw new NotFoundException('dependency_not_found');
    }

    const workspaceEnabled = await this.dependencyWatcherRepository.isWorkspaceEnabled(workspace.id);
    if (!workspaceEnabled) {
      this.logger.warn('dependency_check.workspace_disabled', { workspaceId: workspace.id });
      return { jobId: randomUUID(), queued: 0 };
    }

    const jobId = randomUUID();

    // Publish job to queue for async processing
    await this.dependencyCheckQueuePublisher.publish({
      jobId,
      userId,
      projectId,
      projectSlug,
      workspaceId: workspace.id,
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
