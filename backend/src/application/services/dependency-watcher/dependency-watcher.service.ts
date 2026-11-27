import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { DependencyNotFoundException, WorkspaceNotFoundException } from '../../../domain/exceptions/index.js';

import { DependencyWatcherRepository, type DependencyWatchRecord } from '../../ports/dependency-watcher/dependency-watcher.repository.js';
import { DependencyAlertGateway, type DependencyAlertConfig, type DependencyAlertPayload } from '../../ports/dependency-watcher/dependency-alert.port.js';
import { RegistryStrategyProvider } from '../../ports/dependency-registry/registry-strategy.provider.js';
import type { RegistryVersionInfo } from '../../ports/dependency-registry/registry-strategy.interface.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AiProvider, DependencyUrgency } from '../../../contracts/enums.js';
import { AppLogger } from '../../../observability/logger.js';
import { DependencyCheckQueuePublisher } from '../../ports/dependency-watcher/dependency-check-queue.publisher.js';
import { DependencyImportQueuePublisher } from '../../ports/dependency-watcher/dependency-import-queue.publisher.js';
import { DependencyAlertNotificationService } from './dependency-alert-notification.service.js';


@Injectable()
export class DependencyWatcherService {
  constructor(
    private readonly dependencyWatcherRepository: DependencyWatcherRepository,
    private readonly dependencyAlertGateway: DependencyAlertGateway,
    private readonly registryStrategyProvider: RegistryStrategyProvider,
    private readonly alertNotificationService: DependencyAlertNotificationService,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly contentRepository: ContentRepository,
    private readonly dependencyCheckQueuePublisher: DependencyCheckQueuePublisher,
    private readonly dependencyImportQueuePublisher: DependencyImportQueuePublisher,
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

      const workspaceProjects = await this.contentRepository.listProjectsByWorkspace(workspace.userId, workspace.id);

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

    await this.alertNotificationService.dispatchAlert(record, versionInfo, analysis);

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

  async setWorkspaceWatcherStatus(userId: string, workspaceId: string, workspaceSlug: string, enabled: boolean): Promise<boolean> {
    const workspace = (await this.contentRepository.getWorkspaceById(workspaceId))
      || (await this.contentRepository.getWorkspaceBySlug(userId, workspaceSlug));
    if (!workspace) {
      throw new WorkspaceNotFoundException();
    }

    await this.contentRepository.upsertWorkspace(userId, {
      ...workspace,
      dependencyWatcherEnabled: enabled,
    });

    return enabled;
  }

  async toggleDependency(userId: string, workspaceId: string, dependencyId: string, enabled: boolean): Promise<boolean> {
    const dependency = await this.dependencyWatcherRepository.findById(userId, workspaceId, dependencyId);
    if (!dependency) {
      throw new DependencyNotFoundException();
    }

    await this.dependencyWatcherRepository.update(dependencyId, { enabled });
    return enabled;
  }
}
