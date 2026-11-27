import { Injectable } from '@nestjs/common';

import type { DependencyWatchRecord } from '../../ports/dependency-watcher/dependency-watcher.repository.js';
import type { DependencyAlertResult } from '../../ports/dependency-watcher/dependency-alert.port.js';
import type { RegistryVersionInfo } from '../../ports/dependency-registry/registry-strategy.interface.js';
import { IngestEntryUseCase } from '../../use-cases/ingest/ingest-entry.use-case.js';
import { EmailService } from '../email/email.service.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { UserRepository } from '../../ports/auth/auth.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { CredentialRepository } from '../../ports/integrations/integrations.repository.js';
import { GithubIntegrationGateway } from '../../ports/integrations/github-integration.port.js';
import { decryptConfig } from '../../utils/security/credentials-crypto.utils.js';
import {
  SourceChannel,
  EventType,
  KnowledgeKind,
  CanonicalType,
  Importance,
  DependencyUrgency,
  CredentialRecordStatus,
  IntegrationProvider,
} from '../../../contracts/enums.js';
import { AppLogger } from '../../../observability/logger.js';
import { buildIngestPayload } from '../../mappers/ingest.mapper.js';
import {
  buildDependencyNoteContent,
  buildDependencyIssueTitle,
  buildDependencyIssueBody,
} from './dependency-issue-presenter.js';

@Injectable()
export class DependencyAlertNotificationService {
  constructor(
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly emailService: EmailService,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly userRepository: UserRepository,
    private readonly contentRepository: ContentRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly githubGateway: GithubIntegrationGateway,
    private readonly logger: AppLogger,
  ) {}

  async dispatchAlert(
    record: DependencyWatchRecord,
    versionInfo: RegistryVersionInfo,
    analysis: DependencyAlertResult,
  ): Promise<void> {
    await this.createNote(record, versionInfo, analysis);

    if (analysis.urgency === DependencyUrgency.Critical) {
      await this.sendAlertEmail(record, versionInfo, analysis);
    }

    if (this.shouldCreateGithubIssue(analysis.urgency)) {
      await this.createGithubHealIssue(record, versionInfo, analysis);
    }
  }

  private async createNote(
    record: DependencyWatchRecord,
    versionInfo: RegistryVersionInfo,
    analysis: DependencyAlertResult,
  ): Promise<void> {
    const content = buildDependencyNoteContent(record, versionInfo, analysis);
    const projectSlug = await this.resolveProjectSlug(record);

    this.logger.info('dependency_watcher_creating_note', {
      recordId: record.id,
      packageName: record.packageName,
      repositoryId: record.repositoryId,
      projectSlug,
      workspaceSlug: record.workspaceSlug,
      contentLength: content.length,
      contentPreview: content.substring(0, 500),
    });

    const payload = buildIngestPayload({
      source: {
        channel: SourceChannel.DependencyWatcher,
        system: 'dependency-watcher',
        source: 'dependency-watcher',
        actor: 'system',
        correlationId: `dependency-${record.id}`,
        sessionId: `dependency-${record.id}`,
      },
      event: {
        type: EventType.GenericRecord,
        projectSlug,
      },
      content: {
        rawText: content,
        title: `[Dependency Update] ${record.packageName}: ${record.currentVersion} → ${versionInfo.version}`,
        sections: {
          summary: analysis.summary,
          risks: analysis.breakingChanges || [],
          nextSteps: analysis.nextSteps || [],
        },
      },
      classification: {
        tags: ['dependency-update', record.packageName, analysis.urgency],
        kind: KnowledgeKind.Note,
        canonicalType: CanonicalType.Knowledge,
        importance: Importance.Medium,
      },
    });

    await this.ingestEntryUseCase.execute(payload, record.userId, record.workspaceSlug, {});
  }

  private async sendAlertEmail(
    record: DependencyWatchRecord,
    versionInfo: RegistryVersionInfo,
    analysis: DependencyAlertResult,
  ): Promise<void> {
    const env = this.environmentProvider.read();
    const user = await this.userRepository.findUserById(record.userId);

    if (!user) {
      this.logger.error('dependency_watcher_user_not_found', { userId: record.userId });
      return;
    }

    const project = await this.findProjectByRepository(record);
    const projectName = project?.displayName || 'Unknown Project';

    await this.emailService.sendEmail({
      to: user.email,
      subject: `[${analysis.urgency.toUpperCase()}] Dependency Update: ${record.packageName} (${projectName})`,
      templateName: 'dependency-alert',
      templateData: {
        projectName,
        packageName: record.packageName,
        currentVersion: record.currentVersion,
        latestVersion: versionInfo.version,
        urgency: analysis.urgency,
        summary: analysis.summary,
        breakingChanges: analysis.breakingChanges || [],
        nextSteps: analysis.nextSteps || [],
        repositoryUrl: versionInfo.repositoryUrl,
        frontUrl: env.apiPublicBaseUrl || '',
      },
    });
  }

  private shouldCreateGithubIssue(urgency: string): boolean {
    const env = this.environmentProvider.read();
    const configured = Array.isArray(env.dependencyWatcherGithubIssueUrgencies) && env.dependencyWatcherGithubIssueUrgencies.length > 0
      ? env.dependencyWatcherGithubIssueUrgencies
      : [DependencyUrgency.Critical];
    return configured.includes(String(urgency || '').toLowerCase());
  }

  private async createGithubHealIssue(
    record: DependencyWatchRecord,
    versionInfo: RegistryVersionInfo,
    analysis: DependencyAlertResult,
  ): Promise<void> {
    if (!record.repositoryId) {
      return;
    }

    try {
      const project = await this.findProjectByRepository(record);
      const repo = project?.repositories.find((item) => item.id === record.repositoryId);
      if (!repo?.fullName) {
        this.logger.warn('dependency_watcher_github_issue_repository_not_found', {
          recordId: record.id,
          packageName: record.packageName,
          repositoryId: record.repositoryId,
        });
        return;
      }

      const token = await this.resolveGithubIssueToken(record, repo.fullName);
      if (!token) {
        return;
      }

      const env = this.environmentProvider.read();
      const label = env.dependencyWatcherGithubIssueLabel?.trim() || 'heal-agent';
      const title = buildDependencyIssueTitle({
        urgency: analysis.urgency,
        packageName: record.packageName,
        currentVersion: record.currentVersion,
        targetVersion: versionInfo.version,
      });
      const body = buildDependencyIssueBody({
        record,
        versionInfo,
        analysis,
      });

      const created = await this.githubGateway.createIssue({
        repoFullName: repo.fullName,
        title,
        body,
        labels: [label],
        token,
      });

      if (created) {
        this.logger.info('dependency_watcher_github_issue_created', {
          repository: repo.fullName,
          issueNumber: created.number,
          issueUrl: created.htmlUrl,
          packageName: record.packageName,
          version: versionInfo.version,
          urgency: analysis.urgency,
          label,
        });
      }
    } catch (error) {
      this.logger.error('dependency_watcher_github_issue_failed', {
        recordId: record.id,
        packageName: record.packageName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async resolveGithubIssueToken(
    record: DependencyWatchRecord,
    repoFullName: string,
  ): Promise<string | null> {
    const env = this.environmentProvider.read();
    if (env.dependencyWatcherGithubToken) {
      return env.dependencyWatcherGithubToken;
    }

    const credential = await this.credentialRepository.findCredential(
      record.userId,
      record.workspaceSlug,
      IntegrationProvider.GithubApp,
    );
    if (!credential || credential.status !== CredentialRecordStatus.Connected || credential.revokedAt) {
      this.logger.warn('dependency_watcher_github_issue_credential_unavailable', {
        recordId: record.id,
        workspaceSlug: record.workspaceSlug,
        repository: repoFullName,
      });
      return null;
    }

    const config = decryptConfig(credential.encryptedConfig, this.environmentProvider) as { installationId?: string };
    const installationId = String(config.installationId || '').trim();
    if (!env.githubAppId || !env.githubAppPrivateKey || !installationId) {
      return null;
    }

    return this.githubGateway.fetchInstallationToken({
      appId: env.githubAppId,
      privateKey: env.githubAppPrivateKey,
      installationId,
    });
  }

  private async findProjectByRepository(record: DependencyWatchRecord) {
    if (!record.repositoryId) return null;
    const projects = record.workspaceId
      ? await this.contentRepository.listProjectsByWorkspace(record.userId, record.workspaceId)
      : await this.contentRepository.listProjects(record.userId);
    return projects.find((item) => item.repositories.some((repository) => repository.id === record.repositoryId)) ?? null;
  }

  private async resolveProjectSlug(record: DependencyWatchRecord): Promise<string> {
    const project = await this.findProjectByRepository(record);
    return project?.projectSlug || '';
  }
}
