import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

import type { CheckDependencyInput } from '../../models/dependency-watcher.models.js';
import { DependencyWatcherRepository } from '../../ports/dependency-watcher/dependency-watcher.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import { DependencyCheckQueuePublisher } from '../../ports/dependency-watcher/dependency-check-queue.publisher.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';

@Injectable()
export class CheckDependencyUseCase {
  constructor(
    private readonly dependencyWatcherRepository: DependencyWatcherRepository,
    private readonly contentRepository: ContentRepository,
    private readonly dependencyCheckQueuePublisher: DependencyCheckQueuePublisher,
    private readonly logger: AppLogger,
    private readonly scopeResolver: WorkspaceScopeResolver,
  ) {}

  async execute(input: CheckDependencyInput): Promise<{ jobId: string; queued: number }> {
    const { userId, dependencyId, projectId, projectSlug, workspaceId } = input;

    const { workspaceId: resolvedWorkspaceId } = await this.scopeResolver.resolveProjectWorkspace(
      userId,
      projectId,
      workspaceId,
    );

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
