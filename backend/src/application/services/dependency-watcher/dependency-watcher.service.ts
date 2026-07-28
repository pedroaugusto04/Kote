import { Injectable } from '@nestjs/common';

import { DependencyWatcherRepository, type DependencyWatchRecord } from '../../ports/dependency-watcher/dependency-watcher.repository.js';
import { DependencyAlertGateway, type DependencyAlertConfig, type DependencyAlertPayload } from '../../ports/dependency-watcher/dependency-alert.port.js';
import { RegistryStrategy, type RegistryVersionInfo } from '../../ports/dependency-registry/registry-strategy.interface.js';
import { NpmRegistryStrategy } from '../../ports/dependency-registry/npm-registry.strategy.js';
import { PipRegistryStrategy } from '../../ports/dependency-registry/pip-registry.strategy.js';
import { ComposerRegistryStrategy } from '../../ports/dependency-registry/composer-registry.strategy.js';
import { MavenRegistryStrategy } from '../../ports/dependency-registry/maven-registry.strategy.js';
import { CargoRegistryStrategy } from '../../ports/dependency-registry/cargo-registry.strategy.js';
import { IngestEntryUseCase } from '../../use-cases/ingest/ingest-entry.use-case.js';
import { EmailService } from '../email/email.service.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { UserRepository } from '../../ports/auth/auth.repository.js';
import { AiProvider, SourceChannel, EventType, KnowledgeKind, CanonicalType, Importance, DependencyUrgency, DependencyEcosystem } from '../../../contracts/enums.js';
import { AppLogger } from '../../../observability/logger.js';

@Injectable()
export class DependencyWatcherService {
  private strategies: Map<string, RegistryStrategy> = new Map();

  constructor(
    private readonly dependencyWatcherRepository: DependencyWatcherRepository,
    private readonly dependencyAlertGateway: DependencyAlertGateway,
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly emailService: EmailService,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly userRepository: UserRepository,
    private readonly logger: AppLogger,
  ) {
    this.strategies.set(DependencyEcosystem.Npm, new NpmRegistryStrategy());
    this.strategies.set(DependencyEcosystem.Pip, new PipRegistryStrategy());
    this.strategies.set(DependencyEcosystem.Composer, new ComposerRegistryStrategy());
    this.strategies.set(DependencyEcosystem.Maven, new MavenRegistryStrategy());
    this.strategies.set(DependencyEcosystem.Cargo, new CargoRegistryStrategy());
  }

  async runCheck(checkIntervalHours: number = 24): Promise<{ checked: number; updates: number; errors: number }> {
    const records = await this.dependencyWatcherRepository.findDueForCheck(checkIntervalHours);
    
    let checked = 0;
    let updates = 0;
    let errors = 0;

    for (const record of records) {
      if (!record.enabled) continue;

      const workspaceEnabled = await this.dependencyWatcherRepository.isWorkspaceEnabled(record.workspaceId);
      if (!workspaceEnabled) continue;

      try {
        checked++;
        const hasUpdate = await this.checkPackage(record);
        
        if (hasUpdate) {
          updates++;
        }
      } catch (error) {
        console.error(`Failed to check package ${record.packageName}:`, error);
        errors++;
      }

      await this.dependencyWatcherRepository.update(record.id, {
        lastCheckedAt: new Date(),
      });
    }

    return { checked, updates, errors };
  }

  private async checkPackage(record: DependencyWatchRecord): Promise<boolean> {
    const strategy = this.strategies.get(record.ecosystem);
    if (!strategy) {
      this.logger.error('dependency_watcher_no_strategy', { ecosystem: record.ecosystem });
      return false;
    }

    const versionInfo: RegistryVersionInfo = await strategy.fetchLatestVersion(record.packageName);
    
    if (versionInfo.version === record.currentVersion || versionInfo.version === record.latestSeenVersion) {
      return false;
    }

    const analysis = await this.analyzeUpdate(record, versionInfo);
    
    await this.createNote(record, versionInfo, analysis);
    
    if (analysis.urgency === DependencyUrgency.Critical || analysis.urgency === DependencyUrgency.Recommended) {
      await this.sendAlertEmail(record, versionInfo, analysis);
    }

    await this.dependencyWatcherRepository.update(record.id, {
      latestSeenVersion: versionInfo.version,
      lastAlertedAt: new Date(),
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

  private async createNote(record: DependencyWatchRecord, versionInfo: RegistryVersionInfo, analysis: any) {
    const content = this.buildNoteContent(record, versionInfo, analysis);
    
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
        projectSlug: '',
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

    await this.ingestEntryUseCase.execute(payload, record.userId, '', {});
  }

  private buildNoteContent(record: DependencyWatchRecord, versionInfo: RegistryVersionInfo, analysis: any): string {
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
      sections.push(`- [Repository](${versionInfo.repositoryUrl})`);
      sections.push('');
    }

    return sections.join('\n');
  }

  private async sendAlertEmail(record: DependencyWatchRecord, versionInfo: RegistryVersionInfo, analysis: any) {
    const env = this.environmentProvider.read();
    const user = await this.userRepository.findUserById(record.userId);
    
    if (!user) {
      this.logger.error('dependency_watcher_user_not_found', { userId: record.userId });
      return;
    }

    await this.emailService.sendEmail({
      to: user.email,
      subject: `[${analysis.urgency.toUpperCase()}] Dependency Update: ${record.packageName}`,
      templateName: 'dependency-alert',
      templateData: {
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
