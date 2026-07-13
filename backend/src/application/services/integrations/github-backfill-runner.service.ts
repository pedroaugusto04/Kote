import { Injectable } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { CredentialRecordStatus, IntegrationProvider, MissingCredentialError } from '../../../contracts/enums.js';
import { decryptConfig } from '../../credentials.js';
import { ProcessGithubPushService } from './process-github-push.service.js';
import { GithubRepositoryResolutionService } from './github-repository-resolution.service.js';
import { GithubIntegrationGateway } from '../../ports/integrations/github-integration.port.js';
import { CredentialRepository } from '../../ports/integrations/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { GithubBackfillJobRepository } from '../../ports/integrations/github-backfill-job.repository.js';
import { AppLogger } from '../../../observability/logger.js';

@Injectable()
export class GithubBackfillRunnerService {
  private readonly logger: AppLogger;

  constructor(
    private readonly processGithubPushService: ProcessGithubPushService,
    private readonly githubRepositoryResolution: GithubRepositoryResolutionService,
    private readonly githubIntegrationGateway: GithubIntegrationGateway,
    private readonly credentialRepository: CredentialRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly githubBackfillJobRepository: GithubBackfillJobRepository,
  ) {
    this.logger = AppLogger.create();
  }

  async run(jobId: string, userId: string): Promise<void> {
    const job = await this.githubBackfillJobRepository.findById(jobId, userId);
    if (!job) {
      this.logger.error('github_backfill_runner.job_not_found', { jobId, userId });
      return;
    }

    await this.githubBackfillJobRepository.update(jobId, { status: 'running' });

    try {
      const environment = this.environmentProvider.read();

      const credential = await this.credentialRepository.findCredential(
        userId,
        job.workspaceSlug,
        IntegrationProvider.GithubApp,
      );
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
        userId,
        workspaceSlug: job.workspaceSlug,
        missingCredentialError: MissingCredentialError.NotFound,
      });
      const repositoryByFullName = new Map(
        accessibleRepositories.map((repo) => [repo.fullName.toLowerCase(), repo]),
      );

      let currentProcessed = job.processed;
      let currentImported = job.imported;
      let currentSkipped = job.skipped;
      let currentTotal = job.total;

      const allCommits: Array<{
        commit: {
          sha: string;
          parentSha: string;
          message: string;
          timestamp: string;
          url: string;
        };
        repository: {
          id: number;
          fullName: string;
          name: string;
          private: boolean;
        };
        projectSlug: string;
        branch: string;
      }> = [];

      for (const repoFullName of job.repositories) {
        // Check if job was cancelled
        const currentJob = await this.githubBackfillJobRepository.findById(jobId, userId);
        if (currentJob && currentJob.status === 'cancelled') {
          this.logger.info('github_backfill_runner.cancelled', { jobId });
          return;
        }

        const repository = repositoryByFullName.get(repoFullName.toLowerCase());
        if (!repository) {
          continue;
        }

        const projectSlug = await this.processGithubPushService.findProjectSlugForRepo(
          userId,
          job.workspaceSlug,
          repository.fullName,
        );
        if (!projectSlug) {
          continue;
        }

        const branch = repository.defaultBranch || 'main';
        const commits = await this.githubIntegrationGateway.fetchRecentCommits({
          repoFullName: repository.fullName,
          branch,
          limit: job.limit,
          token,
        });

        for (const commit of commits) {
          allCommits.push({
            commit,
            repository,
            projectSlug,
            branch,
          });
        }
      }

      // Sort all commits by timestamp descending (latest first)
      allCommits.sort((a, b) => {
        const timeA = new Date(a.commit.timestamp).getTime();
        const timeB = new Date(b.commit.timestamp).getTime();
        return timeB - timeA;
      });

      // Keep only the top limit commits overall
      const targetCommits = allCommits.slice(0, job.limit);

      // Reverse to process from oldest to newest (to match normal push chronological order)
      const targetCommitsInOrder = [...targetCommits].reverse();

      currentTotal = targetCommitsInOrder.length;
      await this.githubBackfillJobRepository.update(jobId, { total: currentTotal });

      for (const item of targetCommitsInOrder) {
        // Check if job was cancelled
        const currentJob = await this.githubBackfillJobRepository.findById(jobId, userId);
        if (currentJob && currentJob.status === 'cancelled') {
          this.logger.info('github_backfill_runner.cancelled', { jobId });
          return;
        }

        currentProcessed += 1;
        const { commit, repository, projectSlug, branch } = item;

        const alreadyExists = await this.processGithubPushService.noteExistsForPush(
          userId,
          repository.fullName,
          commit.sha,
        );
        if (alreadyExists) {
          currentSkipped += 1;
          await this.githubBackfillJobRepository.update(jobId, {
            processed: currentProcessed,
            skipped: currentSkipped,
          });
          continue;
        }

        const commitDiff = await this.githubIntegrationGateway.fetchCommitDiff(
          repository.fullName,
          commit.sha,
          token,
        );

        const added: string[] = [];
        const modified: string[] = [];
        const removed: string[] = [];

        for (const file of commitDiff.files) {
          if (file.status === 'added') {
            added.push(file.filename);
          } else if (file.status === 'modified') {
            modified.push(file.filename);
          } else if (file.status === 'removed') {
            removed.push(file.filename);
          }
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
              added,
              modified,
              removed,
            }],
            pusher: { name: 'github-backfill' },
            sender: { login: 'github-backfill' },
          },
          userId,
          workspaceSlug: job.workspaceSlug,
          projectSlug,
          skipWebhookVerification: true,
          quotaSource: 'github_backfill',
        });

        if (!result.ok) {
          if (result.skipped === 'quota_exceeded') {
            const now = new Date().toISOString();
            await this.githubBackfillJobRepository.update(jobId, {
              status: 'quota_exceeded',
              error: 'quota_exceeded',
              processed: currentProcessed,
              skipped: currentSkipped,
              imported: currentImported,
              completedAt: now,
            });
            return;
          }
          currentSkipped += 1;
          await this.githubBackfillJobRepository.update(jobId, {
            processed: currentProcessed,
            skipped: currentSkipped,
          });
          continue;
        }

        currentImported += 1;
        await this.githubBackfillJobRepository.update(jobId, {
          processed: currentProcessed,
          imported: currentImported,
        });
      }

      const now = new Date().toISOString();
      await this.githubBackfillJobRepository.update(jobId, {
        status: 'completed',
        processed: currentProcessed,
        imported: currentImported,
        skipped: currentSkipped,
        completedAt: now,
      });
    } catch (error) {
      this.logger.error('github_backfill_runner.failed', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      await this.githubBackfillJobRepository.update(jobId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString(),
      });
      throw error;
    }
  }
}
