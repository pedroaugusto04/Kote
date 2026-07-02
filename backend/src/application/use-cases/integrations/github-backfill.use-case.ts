import crypto from 'node:crypto';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { CredentialRecordStatus, IntegrationProvider, MissingCredentialError } from '../../../contracts/enums.js';
import { decryptConfig } from '../../credentials.js';
import { ProcessGithubPushService } from '../../services/process-github-push.service.js';
import { GithubRepositoryResolutionService } from '../../services/github-repository-resolution.service.js';
import { GithubIntegrationGateway } from '../../ports/integrations/github-integration.port.js';
import { CredentialRepository } from '../../ports/integrations/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { AppLogger } from '../../../observability/logger.js';

export type GithubBackfillJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'quota_exceeded';

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
  private readonly jobs = new Map<string, GithubBackfillJob>();
  private readonly logger: AppLogger;

  constructor(
    private readonly processGithubPushService: ProcessGithubPushService,
    private readonly githubRepositoryResolution: GithubRepositoryResolutionService,
    private readonly githubIntegrationGateway: GithubIntegrationGateway,
    private readonly credentialRepository: CredentialRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {
    this.logger = AppLogger.create();
  }

  readConfig() {
    const environment = this.environmentProvider.read();
    return {
      githubBackfillLimit: environment.githubBackfillLimit,
    };
  }

  getJob(jobId: string, userId: string): GithubBackfillJob | null {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) return null;
    return job;
  }

  async start(input: StartGithubBackfillInput) {
    const environment = this.environmentProvider.read();
    const limit = environment.githubBackfillLimit;
    const repositories = [...new Set(input.repositories.map((repo) => repo.trim()).filter(Boolean))];
    if (!repositories.length) {
      throw new BadRequestException('repositories_required');
    }

    const credential = await this.credentialRepository.findCredential(input.userId, input.workspaceSlug, IntegrationProvider.GithubApp);
    if (!credential || credential.status !== CredentialRecordStatus.Connected || credential.revokedAt) {
      throw new BadRequestException('github_connection_required');
    }

    for (const repoFullName of repositories) {
      const projectSlug = await this.processGithubPushService.findProjectSlugForRepo(input.userId, input.workspaceSlug, repoFullName);
      if (!projectSlug) {
        throw new BadRequestException({
          code: 'github_repository_not_selected',
          details: { fieldErrors: { repositories: `Repository ${repoFullName} is not linked to a project.` } },
        });
      }
    }

    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();
    const job: GithubBackfillJob = {
      id: jobId,
      userId: input.userId,
      workspaceSlug: input.workspaceSlug,
      repositories,
      status: 'queued',
      total: repositories.length * limit,
      processed: 0,
      imported: 0,
      skipped: 0,
      limit,
      error: null,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
    };
    this.jobs.set(jobId, job);
    void this.runJob(jobId);
    return { ok: true as const, jobId, limit };
  }

  private async runJob(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'running';
    job.updatedAt = new Date().toISOString();

    try {
      const environment = this.environmentProvider.read();
      const credential = await this.credentialRepository.findCredential(job.userId, job.workspaceSlug, IntegrationProvider.GithubApp);
      if (!credential || credential.status !== CredentialRecordStatus.Connected || credential.revokedAt) {
        throw new NotFoundException('credential_not_found');
      }

      const config = decryptConfig(credential.encryptedConfig, this.environmentProvider) as { installationId?: string };
      const installationId = String(config.installationId || '').trim();
      if (!environment.githubAppId || !environment.githubAppPrivateKey || !installationId) {
        throw new BadRequestException('github_app_installation_not_configured');
      }

      const token = await this.githubIntegrationGateway.fetchInstallationToken({
        appId: environment.githubAppId,
        privateKey: environment.githubAppPrivateKey,
        installationId,
      });
      if (!token) {
        throw new BadRequestException('github_installation_token_unavailable');
      }

      const accessibleRepositories = await this.githubRepositoryResolution.listAccessibleRepositories({
        userId: job.userId,
        workspaceSlug: job.workspaceSlug,
        missingCredentialError: MissingCredentialError.NotFound,
      });
      const repositoryByFullName = new Map(accessibleRepositories.map((repo) => [repo.fullName.toLowerCase(), repo]));

      for (const repoFullName of job.repositories) {
        const repository = repositoryByFullName.get(repoFullName.toLowerCase());
        if (!repository) {
          job.skipped += job.limit;
          job.processed += job.limit;
          continue;
        }

        const projectSlug = await this.processGithubPushService.findProjectSlugForRepo(job.userId, job.workspaceSlug, repository.fullName);
        if (!projectSlug) {
          job.skipped += job.limit;
          job.processed += job.limit;
          continue;
        }

        const branch = repository.defaultBranch || 'main';
        const commits = await this.githubIntegrationGateway.fetchRecentCommits({
          repoFullName: repository.fullName,
          branch,
          limit: job.limit,
          token,
        });

        job.total = Math.max(job.total, job.processed + commits.length);

        for (const commit of [...commits].reverse()) {
          job.processed += 1;
          job.updatedAt = new Date().toISOString();

          const alreadyExists = await this.processGithubPushService.noteExistsForPush(job.userId, repository.fullName, commit.sha);
          if (alreadyExists) {
            job.skipped += 1;
            continue;
          }

          const result = await this.processGithubPushService.execute({
            body: {
              ref: `refs/heads/${branch}`,
              before: commit.parentSha,
              after: commit.sha,
              installation: { id: installationId },
              repository: {
                id: repository.id,
                full_name: repository.fullName,
                name: repository.name,
                private: repository.private,
              },
              head_commit: {
                id: commit.sha,
                message: commit.message,
                timestamp: commit.timestamp,
                url: commit.url,
              },
              commits: [{
                id: commit.sha,
                message: commit.message,
                added: [],
                modified: [],
                removed: [],
              }],
              pusher: { name: 'github-backfill' },
              sender: { login: 'github-backfill' },
            },
            userId: job.userId,
            workspaceSlug: job.workspaceSlug,
            projectSlug,
            skipWebhookVerification: true,
            quotaSource: 'github_backfill',
          });

          if (!result.ok) {
            if (result.skipped === 'quota_exceeded') {
              job.status = 'quota_exceeded';
              job.error = 'quota_exceeded';
              job.completedAt = new Date().toISOString();
              job.updatedAt = job.completedAt;
              return;
            }
            job.skipped += 1;
            continue;
          }

          job.imported += 1;
        }
      }

      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.updatedAt = job.completedAt;
    } catch (error) {
      this.logger.error('github_backfill_failed', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.completedAt = new Date().toISOString();
      job.updatedAt = job.completedAt;
    }
  }
}
