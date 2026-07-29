import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { DependencyWatcherRepository, type DependencyWatchRecord } from '../../ports/dependency-watcher/dependency-watcher.repository.js';
import { DependencyAlertGateway, type DependencyAlertConfig, type DependencyAlertPayload, type DependencyAlertResult } from '../../ports/dependency-watcher/dependency-alert.port.js';
import { RegistryStrategyProvider } from '../../ports/dependency-registry/registry-strategy.provider.js';
import type { RegistryVersionInfo } from '../../ports/dependency-registry/registry-strategy.interface.js';
import { IngestEntryUseCase } from '../../use-cases/ingest/ingest-entry.use-case.js';
import { EmailService } from '../email/email.service.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { UserRepository } from '../../ports/auth/auth.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AiProvider, SourceChannel, EventType, KnowledgeKind, CanonicalType, Importance, DependencyUrgency } from '../../../contracts/enums.js';
import { AppLogger } from '../../../observability/logger.js';
import { RabbitMqDependencyCheckQueuePublisher } from '../../../infrastructure/queue/rabbitmq-dependency-check-queue.publisher.js';
import { RabbitMqDependencyImportQueuePublisher } from '../../../infrastructure/queue/rabbitmq-dependency-import-queue.publisher.js';


@Injectable()
export class DependencyWatcherService {
  constructor(
    private readonly dependencyWatcherRepository: DependencyWatcherRepository,
    private readonly dependencyAlertGateway: DependencyAlertGateway,
    private readonly registryStrategyProvider: RegistryStrategyProvider,
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly emailService: EmailService,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly userRepository: UserRepository,
    private readonly contentRepository: ContentRepository,
    private readonly dependencyCheckQueuePublisher: RabbitMqDependencyCheckQueuePublisher,
    private readonly dependencyImportQueuePublisher: RabbitMqDependencyImportQueuePublisher,
    private readonly logger: AppLogger,
  ) {}

  async runCheck(checkIntervalHours: number = 24): Promise<{ queued: number; workspaces: number }> {
    const records = await this.dependencyWatcherRepository.findDueForCheck(checkIntervalHours);
    
    if (records.length === 0) {
      return { queued: 0, workspaces: 0 };
    }

    // Group dependencies by workspace and repository for efficient batching
    const groupedByWorkspace = new Map<string, Map<string, string[]>>();
    
    for (const record of records) {
      if (!record.enabled) continue;
      if (!record.repositoryId) continue;

      const workspaceEnabled = await this.dependencyWatcherRepository.isWorkspaceEnabled(record.workspaceId);
      if (!workspaceEnabled) continue;

      if (!groupedByWorkspace.has(record.workspaceId)) {
        groupedByWorkspace.set(record.workspaceId, new Map());
      }
      
      const workspaceMap = groupedByWorkspace.get(record.workspaceId)!;
      if (!workspaceMap.has(record.repositoryId)) {
        workspaceMap.set(record.repositoryId, []);
      }
      
      workspaceMap.get(record.repositoryId)!.push(record.id);
    }

    let totalQueued = 0;
    const workspaceIds = Array.from(groupedByWorkspace.keys());

    // Publish one job per workspace-repository combination
    for (const [workspaceId, repositoryMap] of groupedByWorkspace) {
      const workspace = await this.contentRepository.getWorkspaceById(workspaceId);
      if (!workspace) {
        this.logger.warn('dependency_watcher_cron_workspace_not_found', { workspaceId });
        continue;
      }

      for (const [repositoryId, dependencyIds] of repositoryMap) {
        const jobId = randomUUID();
        
        await this.dependencyCheckQueuePublisher.publish({
          jobId,
          userId: workspace.userId,
          projectId: '', // Cron checks are not project-specific
          projectSlug: workspace.workspaceSlug,
          workspaceId,
          repositoryIds: [repositoryId],
          dependencyIds,
        });

        totalQueued += dependencyIds.length;
      }
    }

    this.logger.info('dependency_watcher_cron_queued', {
      workspaces: workspaceIds.length,
      totalQueued,
      repositoryCombinations: Array.from(groupedByWorkspace.values()).reduce((acc, repoMap) => acc + repoMap.size, 0),
    });

    return { queued: totalQueued, workspaces: workspaceIds.length };
  }

  async runImport(): Promise<{ queued: number; workspaces: number }> {
    const enabledWorkspaces = await this.dependencyWatcherRepository.findEnabledWorkspaces();
    
    if (enabledWorkspaces.length === 0) {
      return { queued: 0, workspaces: 0 };
    }

    let totalQueued = 0;

    for (const workspace of enabledWorkspaces) {
      const workspaceEnabled = await this.dependencyWatcherRepository.isWorkspaceEnabled(workspace.id);
      if (!workspaceEnabled) continue;

      const projects = await this.contentRepository.listProjects(workspace.userId);
      const workspaceProjects = projects.filter((p) => p.workspaceSlug === workspace.workspaceSlug);

      if (workspaceProjects.length === 0) continue;

      const allRepositoryIds = workspaceProjects.flatMap((project) => 
        project.repositories.map((repo) => repo.id)
      );

      if (allRepositoryIds.length === 0) continue;

      const monitoredRepositoryIds = await this.dependencyWatcherRepository.listMonitoredRepositoryIds(
        workspace.userId,
        workspace.id,
      );

      const repositoryIds = allRepositoryIds.filter((repoId) => monitoredRepositoryIds.includes(repoId));

      if (repositoryIds.length === 0) continue;

      const jobId = randomUUID();

      await this.dependencyImportQueuePublisher.publish({
        jobId,
        userId: workspace.userId,
        workspaceSlug: workspace.workspaceSlug,
        workspaceId: workspace.id,
        repositoryIds,
      });

      totalQueued += repositoryIds.length;

      this.logger.info('dependency_watcher_import_queued', {
        workspaceId: workspace.id,
        workspaceSlug: workspace.workspaceSlug,
        repositoryCount: repositoryIds.length,
      });
    }

    this.logger.info('dependency_watcher_import_completed', {
      workspaces: enabledWorkspaces.length,
      totalQueued,
    });

    return { queued: totalQueued, workspaces: enabledWorkspaces.length };
  }

  async checkPackage(record: DependencyWatchRecord): Promise<boolean> {
    const strategy = this.registryStrategyProvider.getStrategy(record.ecosystem);
    if (!strategy) {
      this.logger.error('dependency_watcher_no_strategy', { ecosystem: record.ecosystem });
      return false;
    }

    const versionInfo: RegistryVersionInfo = await strategy.fetchLatestVersion(record.packageName);
    
    if (versionInfo.version === record.currentVersion || versionInfo.version === record.latestSeenVersion) {
      // Update lastCheckedAt and latestSeenVersion even if no update available
      await this.dependencyWatcherRepository.update(record.id, {
        latestSeenVersion: versionInfo.version,
        lastCheckedAt: new Date(),
      });
      return false;
    }

    const analysis = await this.analyzeUpdate(record, versionInfo);
    
    await this.createNote(record, versionInfo, analysis);
    
    if (analysis.urgency === DependencyUrgency.Critical) {
      await this.sendAlertEmail(record, versionInfo, analysis);
    }

    await this.dependencyWatcherRepository.update(record.id, {
      latestSeenVersion: versionInfo.version,
      lastAlertedAt: new Date(),
      lastUrgency: analysis.urgency,
      lastCheckedAt: new Date(),
    });

    return true;
  }

  private async analyzeUpdate(record: DependencyWatchRecord, versionInfo: RegistryVersionInfo) {
    const env = this.environmentProvider.read();
    
    const config: DependencyAlertConfig = {
      provider: env.dependencyWatcherAiProvider || env.defaultChatAiProvider,
      baseUrl: env.dependencyWatcherAiBaseUrl || env.defaultChatAiBaseUrl,
      model: env.dependencyWatcherAiModel || env.defaultChatAiModel,
      apiKey: env.dependencyWatcherAiApiKey || env.defaultChatAiApiKey,
    };

    if (config.provider === AiProvider.None || !config.apiKey) {
      return {
        urgency: DependencyUrgency.Optional,
        summary: `New version ${versionInfo.version} available`,
        breakingChanges: [],
        nextSteps: ['Review the changelog', 'Test in development environment'],
      };
    }

    const payload: DependencyAlertPayload = {
      packageName: record.packageName,
      currentVersion: record.currentVersion,
      latestVersion: versionInfo.version,
      changelog: versionInfo.releaseNotes || versionInfo.repositoryUrl,
      ecosystem: record.ecosystem,
    };

    return await this.dependencyAlertGateway.analyze(config, payload);
  }

  private async createNote(record: DependencyWatchRecord, versionInfo: RegistryVersionInfo, analysis: DependencyAlertResult) {
    const content = this.buildNoteContent(record, versionInfo, analysis);
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
    
    const payload = {
      source: {
        channel: SourceChannel.DependencyWatcher,
        system: 'dependency-watcher',
        source: 'dependency-watcher',
        actor: 'system',
        conversationId: '',
        correlationId: `dependency-${record.id}`,
        sessionId: `dependency-${record.id}`,
      },
      event: {
        type: EventType.GenericRecord,
        occurredAt: new Date().toISOString(),
        projectSlug,
      },
      content: {
        rawText: content,
        title: `[Dependency Update] ${record.packageName}: ${record.currentVersion} → ${versionInfo.version}`,
        attachments: [],
        sections: {
          summary: analysis.summary,
          impact: '',
          risks: analysis.breakingChanges || [],
          nextSteps: analysis.nextSteps || [],
          reviewFindings: [],
        },
      },
      classification: {
        tags: ['dependency-update', record.packageName, analysis.urgency],
        kind: KnowledgeKind.Note,
        canonicalType: CanonicalType.Knowledge,
        importance: Importance.Medium,
        decisionFlag: false,
      },
      actions: {
        reminderAt: '',
        followUpBy: '',
      },
      links: [],
      metadata: {},
    };

    await this.ingestEntryUseCase.execute(payload, record.userId, record.workspaceSlug, {});
  }

  private async resolveProjectSlug(record: DependencyWatchRecord): Promise<string> {
    if (!record.repositoryId) return '';

    const projects = await this.contentRepository.listProjects(record.userId);
    const project = projects.find(
      (item) => item.workspaceSlug === record.workspaceSlug
        && item.repositories.some((repository) => repository.id === record.repositoryId),
    );

    return project?.projectSlug || '';
  }

  private buildNoteContent(record: DependencyWatchRecord, versionInfo: RegistryVersionInfo, analysis: DependencyAlertResult): string {
    const sections = [];

    sections.push(`## Summary`);
    sections.push(analysis.summary);
    sections.push('');

    sections.push(`## Version Information`);
    sections.push(`- **Package**: ${record.packageName}`);
    sections.push(`- **Current Version**: ${record.currentVersion}`);
    sections.push(`- **Latest Version**: ${versionInfo.version}`);
    sections.push(`- **Ecosystem**: ${record.ecosystem}`);
    sections.push('');

    if (analysis.breakingChanges && analysis.breakingChanges.length > 0) {
      sections.push(`## Breaking Changes`);
      analysis.breakingChanges.forEach((change: string) => {
        sections.push(`- ${change}`);
      });
      sections.push('');
    }

    if (analysis.nextSteps && analysis.nextSteps.length > 0) {
      sections.push(`## Next Steps`);
      analysis.nextSteps.forEach((step: string) => {
        sections.push(`- ${step}`);
      });
      sections.push('');
    }

    if (versionInfo.repositoryUrl) {
      sections.push(`## Links`);
      sections.push(`- Repository: ${versionInfo.repositoryUrl}`);
      sections.push('');
    }

    return sections.join('\n');
  }

  private async sendAlertEmail(record: DependencyWatchRecord, versionInfo: RegistryVersionInfo, analysis: DependencyAlertResult) {
    const env = this.environmentProvider.read();
    const user = await this.userRepository.findUserById(record.userId);
    
    if (!user) {
      this.logger.error('dependency_watcher_user_not_found', { userId: record.userId });
      return;
    }

    // Get project name from repository
    let projectName = 'Unknown Project';
    if (record.repositoryId) {
      const projects = await this.contentRepository.listProjects(record.userId);
      for (const project of projects) {
        if (project.repositories.some(repo => repo.id === record.repositoryId)) {
          projectName = project.displayName;
          break;
        }
      }
    }

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
}
