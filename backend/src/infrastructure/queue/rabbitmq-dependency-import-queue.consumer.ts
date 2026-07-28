import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { type Channel, type ConsumeMessage } from 'amqplib';
import { CredentialRecordStatus, IntegrationProvider, DependencyEcosystem } from '../../contracts/enums.js';
import { decryptConfig } from '../../application/credentials.js';
import { DependencyWatcherRepository, type CreateDependencyWatchInput } from '../../application/ports/dependency-watcher/dependency-watcher.repository.js';
import { GithubIntegrationGateway } from '../../application/ports/integrations/github-integration.port.js';
import { ContentRepository } from '../../application/ports/notes/content.repository.js';
import { CredentialRepository } from '../../application/ports/integrations/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../application/ports/observability/runtime-environment.port.js';
import { cleanVersion } from '../../application/utils/dependency/version.utils.js';
import { getManifestFilePriority, generateManifestSearchPaths } from '../../application/utils/dependency/manifest-detector.utils.js';
import { parseManifestDependencies } from '../../application/utils/dependency/manifest-parser.utils.js';
import { AppLogger } from '../../observability/logger.js';
import { BaseRabbitMqConsumer } from './base-rabbitmq.consumer.js';
import { type DependencyImportJobMessage } from './rabbitmq-dependency-import-queue.publisher.js';
import { calculateBackoff, isRateLimitError, RateLimitError, type BackoffOptions } from '../../application/utils/retry/backoff.utils.js';

const QUEUE_NAME = 'kb.dependency_import.jobs';
const DLX_NAME = 'kb.dependency_import.dlx';

const BACKOFF_OPTIONS: BackoffOptions = {
  baseDelayMs: 30000, // 30 seconds (longer for import operations)
  maxDelayMs: 3600000, // 1 hour (imports can take a long time)
  maxRetries: 3,
  multiplier: 2,
  jitterPercent: 20,
};

@Injectable()
export class RabbitMqDependencyImportQueueConsumer extends BaseRabbitMqConsumer {
  constructor(
    logger: AppLogger,
    private readonly dependencyWatcherRepository: DependencyWatcherRepository,
    private readonly githubGateway: GithubIntegrationGateway,
    private readonly contentRepository: ContentRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {
    super(logger);
  }

  protected async setupChannel(channel: Channel): Promise<void> {
    await channel.prefetch(3); // Process fewer import jobs concurrently (more intensive)
    await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': DLX_NAME,
      },
    });
  }

  protected async startConsuming(channel: Channel): Promise<void> {
    await channel.consume(QUEUE_NAME, async (msg) => {
      if (!msg) return;

      try {
        const message: DependencyImportJobMessage = JSON.parse(msg.content.toString());
        await this.processMessage(message, channel, msg);
      } catch (error) {
        this.logger.error('dependency_import_consumer.parse_error', {
          error: error instanceof Error ? error.message : String(error),
        });
        channel.nack(msg, false, false); // Don't requeue on parse error
      }
    });
  }

  private async processMessage(message: DependencyImportJobMessage, channel: Channel, msg: ConsumeMessage): Promise<void> {
    const { jobId, userId, workspaceSlug, workspaceId, projectIds, repositoryIds, retryCount = 0 } = message;

    this.logger.info('dependency_import_consumer.started', {
      jobId,
      workspaceSlug,
      projectIds,
      repositoryIds,
      retryCount,
    });

    try {
      const workspace = await this.contentRepository.getWorkspaceBySlug(userId, workspaceSlug);
      if (!workspace) {
        this.logger.error('dependency_import_consumer.workspace_not_found', { jobId, workspaceSlug });
        channel.ack(msg);
        return;
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
        this.logger.warn('dependency_import_consumer.no_projects', { jobId });
        channel.ack(msg);
        return;
      }

      const credential = await this.credentialRepository.findCredential(userId, workspaceSlug, IntegrationProvider.GithubApp);
      if (!credential || credential.status !== CredentialRecordStatus.Connected || credential.revokedAt) {
        this.logger.error('dependency_import_consumer.github_credential_not_found', { jobId, workspaceSlug });
        channel.ack(msg);
        return;
      }

      const environment = this.environmentProvider.read();
      const config = decryptConfig(credential.encryptedConfig, this.environmentProvider) as { installationId?: string };
      const installationId = String(config.installationId || '').trim();
      if (!environment.githubAppId || !environment.githubAppPrivateKey || !installationId) {
        this.logger.error('dependency_import_consumer.github_app_not_configured', { jobId });
        channel.ack(msg);
        return;
      }

      const token = await this.githubGateway.fetchInstallationToken({
        appId: environment.githubAppId,
        privateKey: environment.githubAppPrivateKey,
        installationId,
      });

      if (!token) {
        this.logger.error('dependency_import_consumer.github_token_unavailable', { jobId });
        channel.ack(msg);
        return;
      }

      let total = 0;
      let imported = 0;
      let skipped = 0;

      for (const project of workspaceProjects) {
        for (const repo of project.repositories) {
          try {
            const manifestFiles = getManifestFilePriority();
            const searchPaths = generateManifestSearchPaths(manifestFiles);
            let dependenciesFound = false;
            const batchInputs: CreateDependencyWatchInput[] = [];

            for (const manifestPath of searchPaths) {
              const content = await this.githubGateway.fetchFileContent(
                repo.fullName,
                manifestPath,
                token,
              );

              if (!content) {
                continue;
              }

              const fileName = manifestPath.split('/').pop() || manifestPath;
              const ecosystem = this.detectEcosystemFromManifest(fileName);
              if (!ecosystem) {
                continue;
              }

              const dependencies = parseManifestDependencies(fileName, content);

              for (const dep of dependencies) {
                total++;
                const cleanedVersion = cleanVersion(dep.version);

                batchInputs.push({
                  userId,
                  workspaceId: workspace.id,
                  ecosystem,
                  packageName: dep.packageName,
                  currentVersion: cleanedVersion,
                  repositoryId: repo.id,
                });

                imported++;
              }

              dependenciesFound = true;
            }

            // Batch upsert all dependencies for this repository
            if (batchInputs.length > 0) {
              await this.dependencyWatcherRepository.batchUpsert(batchInputs);
            }

            if (!dependenciesFound) {
              skipped++;
            }

            this.logger.info('dependency_import_consumer.repository_processed', {
              jobId,
              repository: repo.fullName,
              dependenciesFound: batchInputs.length,
            });
          } catch (error) {
            this.logger.error('dependency_import_consumer.repository_failed', {
              jobId,
              repository: repo.fullName,
              error: error instanceof Error ? error.message : String(error),
            });
            skipped++;
          }
        }
      }

      this.logger.info('dependency_import_consumer.completed', {
        jobId,
        workspaceSlug,
        total,
        imported,
        skipped,
        repositories: workspaceProjects.reduce((acc, project) => acc + project.repositories.length, 0),
      });

      channel.ack(msg);
    } catch (error) {
      this.logger.error('dependency_import_consumer.processing_error', {
        jobId,
        workspaceSlug,
        error: error instanceof Error ? error.message : String(error),
        retryCount,
      });

      // Retry logic with adaptive exponential backoff
      const isRateLimit = isRateLimitError(error);
      const backoff = calculateBackoff(retryCount, BACKOFF_OPTIONS, isRateLimit, isRateLimit ? (error as RateLimitError).retryAfterMs : undefined);

      if (backoff.shouldRetry) {
        this.logger.info('dependency_import_consumer.retry_scheduled', {
          jobId,
          retryCount: backoff.retryCount + 1,
          delayMs: backoff.delayMs,
          isRateLimit,
        });

        setTimeout(() => {
          const retryMessage: DependencyImportJobMessage = {
            ...message,
            retryCount: backoff.retryCount + 1,
          };
          
          channel.publish(
            '',
            QUEUE_NAME,
            Buffer.from(JSON.stringify(retryMessage)),
            { persistent: true },
          );
        }, backoff.delayMs);

        channel.ack(msg);
      } else {
        this.logger.error('dependency_import_consumer.max_retries_exceeded', {
          jobId,
          workspaceSlug,
          retryCount: backoff.retryCount,
        });
        channel.nack(msg, false, false); // Send to DLQ
      }
    }
  }

  private detectEcosystemFromManifest(fileName: string): DependencyEcosystem | null {
    const manifestMap: Record<string, DependencyEcosystem> = {
      'package.json': DependencyEcosystem.Npm,
      'requirements.txt': DependencyEcosystem.Pip,
      'pyproject.toml': DependencyEcosystem.Pip,
      'composer.json': DependencyEcosystem.Composer,
      'pom.xml': DependencyEcosystem.Maven,
      'Cargo.toml': DependencyEcosystem.Cargo,
      'go.mod': DependencyEcosystem.Go,
      'Gemfile': DependencyEcosystem.RubyGems,
      'build.gradle': DependencyEcosystem.Gradle,
      'build.gradle.kts': DependencyEcosystem.Gradle,
    };

    return manifestMap[fileName] || null;
  }
}
