import crypto from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';

import { CredentialRecordStatus, IntegrationProvider } from '../../../contracts/enums.js';
import { ProcessGithubPushService } from '../../services/integrations/process-github-push.service.js';
import { CredentialRepository } from '../../ports/integrations/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { GithubBackfillJobRepository } from '../../ports/integrations/github-backfill-job.repository.js';
import { BackfillQueuePublisher } from '../../ports/integrations/backfill-queue.publisher.js';
import { AppLogger } from '../../../observability/logger.js';

export type GithubBackfillJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'quota_exceeded' | 'cancelled';

export type GithubBackfillJob = {
  id: string;
  userId: string;
  workspaceSlug: string;
  repositories: string[];
  status: GithubBackfillJobStatus;
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  limit: number;
  error: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type StartGithubBackfillInput = {
  userId: string;
  workspaceSlug: string;
  repositories: string[];
};

@Injectable()
export class GithubBackfillUseCase {
  private readonly logger: AppLogger;

  constructor(
    private readonly processGithubPushService: ProcessGithubPushService,
    private readonly credentialRepository: CredentialRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly githubBackfillJobRepository: GithubBackfillJobRepository,
    private readonly backfillQueuePublisher: BackfillQueuePublisher,
  ) {
    this.logger = AppLogger.create();
  }

  readConfig() {
    const environment = this.environmentProvider.read();
    return {
      githubBackfillLimit: environment.githubBackfillLimit,
    };
  }

  async getJob(jobId: string, userId: string): Promise<GithubBackfillJob | null> {
    return this.githubBackfillJobRepository.findById(jobId, userId);
  }

  async cancel(jobId: string, userId: string): Promise<boolean> {
    const job = await this.githubBackfillJobRepository.findById(jobId, userId);
    if (!job) {
      throw new BadRequestException('job_not_found');
    }
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'quota_exceeded' || job.status === 'cancelled') {
      throw new BadRequestException('job_already_finished');
    }
    await this.githubBackfillJobRepository.update(jobId, {
      status: 'cancelled',
      completedAt: new Date().toISOString(),
    });
    this.logger.info('github_backfill.cancelled', { jobId, userId });
    return true;
  }

  async start(input: StartGithubBackfillInput) {
    const environment = this.environmentProvider.read();
    const limit = environment.githubBackfillLimit;
    const repositories = [...new Set(input.repositories.map((repo) => repo.trim()).filter(Boolean))];
    if (!repositories.length) {
      throw new BadRequestException('repositories_required');
    }

    // Check if a backfill has already been completed for this workspace
    const existingBackfill = await this.githubBackfillJobRepository.findCompletedByWorkspace(
      input.userId,
      input.workspaceSlug,
    );
    if (existingBackfill) {
      throw new BadRequestException('backfill_already_completed');
    }

    const credential = await this.credentialRepository.findCredential(
      input.userId,
      input.workspaceSlug,
      IntegrationProvider.GithubApp,
    );
    if (!credential || credential.status !== CredentialRecordStatus.Connected || credential.revokedAt) {
      throw new BadRequestException('github_connection_required');
    }

    for (const repoFullName of repositories) {
      const projectSlug = await this.processGithubPushService.findProjectSlugForRepo(
        input.userId,
        input.workspaceSlug,
        repoFullName,
      );
      if (!projectSlug) {
        throw new BadRequestException({
          code: 'github_repository_not_selected',
          details: { fieldErrors: { repositories: `Repository ${repoFullName} is not linked to a project.` } },
        });
      }
    }

    const jobId = crypto.randomUUID();

    const job = await this.githubBackfillJobRepository.create({
      id: jobId,
      userId: input.userId,
      workspaceSlug: input.workspaceSlug,
      repositories,
      total: limit,
      limit,
    });

    await this.backfillQueuePublisher.publish({ jobId: job.id });

    this.logger.info('github_backfill.enqueued', { jobId: job.id, userId: input.userId });

    return { ok: true as const, jobId: job.id, limit };
  }
}
