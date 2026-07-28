import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { CredentialRecordStatus, IntegrationProvider } from '../../../contracts/enums.js';
import { DependencyWatcherRepository } from '../../ports/dependency-watcher/dependency-watcher.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { CredentialRepository } from '../../ports/integrations/integrations.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import { RabbitMqDependencyImportQueuePublisher } from '../../../infrastructure/queue/rabbitmq-dependency-import-queue.publisher.js';

type ImportOptions = {
  projectIds?: string[];
  repositoryIds?: string[];
};

type ImportResult = {
  jobId: string;
  queued: number;
  repositories: number;
};

@Injectable()
export class ImportDependenciesFromGithubUseCase {
  constructor(
    private readonly dependencyWatcherRepository: DependencyWatcherRepository,
    private readonly contentRepository: ContentRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly dependencyImportQueuePublisher: RabbitMqDependencyImportQueuePublisher,
    private readonly logger: AppLogger,
  ) {}

  async execute(userId: string, workspaceSlug: string, options: ImportOptions = {}): Promise<ImportResult> {
    const { projectIds, repositoryIds } = options;
    const workspace = await this.contentRepository.getWorkspaceBySlug(userId, workspaceSlug);
    if (!workspace) {
      throw new NotFoundException('workspace_not_found');
    }

    const projects = await this.contentRepository.listProjects(userId);
    let workspaceProjects = projects.filter((p) => p.workspaceSlug === workspaceSlug);

    if (projectIds && projectIds.length > 0) {
      workspaceProjects = workspaceProjects.filter((p) => projectIds.includes(p.id));
    }

    const repositoryIdFilter = repositoryIds && repositoryIds.length > 0
      ? new Set(repositoryIds)
      : null;

    if (repositoryIdFilter) {
      workspaceProjects = workspaceProjects
        .map((project) => ({
          ...project,
          repositories: project.repositories.filter((repo) => repositoryIdFilter.has(repo.id)),
        }))
        .filter((project) => project.repositories.length > 0);
    }

    if (workspaceProjects.length === 0) {
      return { jobId: randomUUID(), queued: 0, repositories: 0 };
    }

    const credential = await this.credentialRepository.findCredential(userId, workspaceSlug, IntegrationProvider.GithubApp);
    if (!credential || credential.status !== CredentialRecordStatus.Connected || credential.revokedAt) {
      throw new NotFoundException('github_credential_not_found');
    }

    const jobId = randomUUID();
    const repoCount = workspaceProjects.reduce((acc, project) => acc + project.repositories.length, 0);

    // Publish job to queue for async processing
    await this.dependencyImportQueuePublisher.publish({
      jobId,
      userId,
      workspaceSlug,
      workspaceId: workspace.id,
      projectIds,
      repositoryIds,
    });

    this.logger.info('dependency_import.queued', {
      jobId,
      workspaceSlug,
      projectIds,
      repositoryIds,
      repositoryCount: repoCount,
    });

    return { jobId, queued: repoCount, repositories: repoCount };
  }
}
