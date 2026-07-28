import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DependencyWatcherService } from '../../../../src/application/services/dependency-watcher/dependency-watcher.service.js';
import { DependencyWatcherRepository, type DependencyWatchRecord } from '../../../../src/application/ports/dependency-watcher/dependency-watcher.repository.js';
import { DependencyAlertGateway, type DependencyAlertResult } from '../../../../src/application/ports/dependency-watcher/dependency-alert.port.js';
import { RegistryStrategyProvider } from '../../../../src/application/ports/dependency-registry/registry-strategy.provider.js';
import type { RegistryStrategy, RegistryVersionInfo } from '../../../../src/application/ports/dependency-registry/registry-strategy.interface.js';
import { IngestEntryUseCase } from '../../../../src/application/use-cases/ingest/ingest-entry.use-case.js';
import { EmailService } from '../../../../src/application/services/email/email.service.js';
import { RuntimeEnvironmentProvider, type RuntimeEnvironment } from '../../../../src/application/ports/observability/runtime-environment.port.js';
import { UserRepository } from '../../../../src/application/ports/auth/auth.repository.js';
import { AppLogger } from '../../../../src/observability/logger.js';
import { DependencyUrgency, DependencyEcosystem } from '../../../../src/domain/enums/dependency.enums.js';
import { AiProvider } from '../../../../src/domain/enums/ai.enums.js';

describe('Backend: Dependency Watcher Service', () => {
  let service: DependencyWatcherService;
  let mockDependencyWatcherRepository: DependencyWatcherRepository;
  let mockDependencyAlertGateway: DependencyAlertGateway;
  let mockRegistryStrategyProvider: RegistryStrategyProvider;
  let mockFetchLatestVersion: ReturnType<typeof vi.fn>;
  let mockIngestEntryUseCase: IngestEntryUseCase;
  let mockEmailService: EmailService;
  let mockEnvironmentProvider: RuntimeEnvironmentProvider;
  let mockUserRepository: UserRepository;
  let mockLogger: AppLogger;

  const mockRecord: DependencyWatchRecord = {
    id: 'record-123',
    userId: 'user-123',
    workspaceId: 'workspace-123',
    workspaceSlug: 'test-workspace',
    ecosystem: DependencyEcosystem.Npm,
    packageName: 'express',
    currentVersion: '4.18.0',
    latestSeenVersion: '4.18.0',
    checkIntervalHours: 24,
    lastCheckedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    lastAlertedAt: null,
    enabled: true,
    repositoryId: 'repo-123',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockVersionInfo: RegistryVersionInfo = {
    version: '4.19.0',
    repositoryUrl: 'https://github.com/expressjs/express',
  };

  const mockAnalysis: DependencyAlertResult = {
    urgency: DependencyUrgency.Critical,
    summary: 'Security vulnerability fix',
    breakingChanges: ['Removed deprecated middleware'],
    nextSteps: ['Update to latest version', 'Test middleware compatibility'],
  };

  const mockEnvironment: RuntimeEnvironment = {
    dependencyWatcherAiProvider: AiProvider.OpenAi,
    dependencyWatcherAiBaseUrl: 'https://api.openai.com',
    dependencyWatcherAiModel: 'gpt-4',
    dependencyWatcherAiApiKey: 'sk-test',
    defaultChatAiProvider: AiProvider.OpenAi,
    defaultChatAiBaseUrl: 'https://api.openai.com',
    defaultChatAiModel: 'gpt-4',
    defaultChatAiApiKey: 'sk-test',
    apiPublicBaseUrl: 'https://api.example.com',
  } as RuntimeEnvironment;

  beforeEach(() => {
    mockFetchLatestVersion = vi.fn().mockResolvedValue(mockVersionInfo);

    mockDependencyWatcherRepository = {
      findDueForCheck: vi.fn(),
      update: vi.fn(),
      isWorkspaceEnabled: vi.fn().mockResolvedValue(true),
    } as unknown as DependencyWatcherRepository;

    mockDependencyAlertGateway = {
      analyze: vi.fn(),
    } as unknown as DependencyAlertGateway;

    mockRegistryStrategyProvider = {
      getStrategy: vi.fn().mockReturnValue({
        fetchLatestVersion: mockFetchLatestVersion,
      } as RegistryStrategy),
    } as unknown as RegistryStrategyProvider;

    mockIngestEntryUseCase = {
      execute: vi.fn(),
    } as unknown as IngestEntryUseCase;

    mockEmailService = {
      sendEmail: vi.fn(),
    } as unknown as EmailService;

    mockEnvironmentProvider = {
      read: vi.fn().mockReturnValue(mockEnvironment),
    } as unknown as RuntimeEnvironmentProvider;

    mockLogger = {
      error: vi.fn(),
    } as unknown as AppLogger;

    mockUserRepository = {
      findUserById: vi.fn().mockResolvedValue({ email: 'user@example.com' }),
    } as unknown as UserRepository;

    service = new DependencyWatcherService(
      mockDependencyWatcherRepository,
      mockDependencyAlertGateway,
      mockRegistryStrategyProvider,
      mockIngestEntryUseCase,
      mockEmailService,
      mockEnvironmentProvider,
      mockUserRepository,
      mockLogger,
    );
  });

  describe('Business Rules', () => {
    it('should skip packages where current version equals latest version', async () => {
      mockFetchLatestVersion.mockResolvedValue({ version: '4.18.0', repositoryUrl: '' });
      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue([mockRecord]);

      const result = await service.runCheck(24);

      expect(result.checked).toBe(1);
      expect(result.updates).toBe(0);
      expect(mockIngestEntryUseCase.execute).not.toHaveBeenCalled();
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });

    it('should skip packages where latest version equals latest seen version', async () => {
      mockFetchLatestVersion.mockResolvedValue(mockVersionInfo);
      const seenVersionRecord = {
        ...mockRecord,
        latestSeenVersion: '4.19.0',
      };

      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue([seenVersionRecord]);

      const result = await service.runCheck(24);

      expect(result.checked).toBe(1);
      expect(result.updates).toBe(0);
      expect(mockIngestEntryUseCase.execute).not.toHaveBeenCalled();
    });

    it('should process packages with new version available', async () => {
      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue([mockRecord]);
      vi.mocked(mockDependencyAlertGateway.analyze).mockResolvedValue(mockAnalysis);

      const result = await service.runCheck(24);

      expect(result.checked).toBe(1);
      expect(result.updates).toBe(1);
      expect(mockIngestEntryUseCase.execute).toHaveBeenCalled();
    });

    it('should create note with changelog summary for updates', async () => {
      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue([mockRecord]);
      vi.mocked(mockDependencyAlertGateway.analyze).mockResolvedValue(mockAnalysis);

      await service.runCheck(24);

      expect(mockIngestEntryUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            rawText: expect.stringContaining('Security vulnerability fix'),
          }),
        }),
        mockRecord.userId,
        mockRecord.workspaceSlug,
        {},
      );
    });

    it('should send email alert for critical urgency', async () => {
      const criticalAnalysis: DependencyAlertResult = {
        ...mockAnalysis,
        urgency: DependencyUrgency.Critical,
      };

      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue([mockRecord]);
      vi.mocked(mockDependencyAlertGateway.analyze).mockResolvedValue(criticalAnalysis);

      await service.runCheck(24);

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          templateName: 'dependency-alert',
          templateData: expect.objectContaining({
            packageName: 'express',
            currentVersion: '4.18.0',
            latestVersion: '4.19.0',
            urgency: DependencyUrgency.Critical,
          }),
        }),
      );
    });

    it('should send email alert for recommended urgency', async () => {
      const recommendedAnalysis: DependencyAlertResult = {
        ...mockAnalysis,
        urgency: DependencyUrgency.Recommended,
      };

      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue([mockRecord]);
      vi.mocked(mockDependencyAlertGateway.analyze).mockResolvedValue(recommendedAnalysis);

      await service.runCheck(24);

      expect(mockEmailService.sendEmail).toHaveBeenCalled();
    });

    it('should NOT send email alert for optional urgency', async () => {
      const optionalAnalysis: DependencyAlertResult = {
        ...mockAnalysis,
        urgency: DependencyUrgency.Optional,
      };

      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue([mockRecord]);
      vi.mocked(mockDependencyAlertGateway.analyze).mockResolvedValue(optionalAnalysis);

      await service.runCheck(24);

      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });

    it('should update dependency watch record with latest version and alert timestamp', async () => {
      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue([mockRecord]);
      vi.mocked(mockDependencyAlertGateway.analyze).mockResolvedValue(mockAnalysis);

      await service.runCheck(24);

      expect(mockDependencyWatcherRepository.update).toHaveBeenCalledWith(
        mockRecord.id,
        expect.objectContaining({
          latestSeenVersion: '4.19.0',
          lastAlertedAt: expect.any(Date),
        }),
      );
    });

    it('should handle missing AI provider gracefully', async () => {
      const noAiEnvironment = {
        ...mockEnvironment,
        dependencyWatcherAiProvider: AiProvider.None,
      };
      vi.mocked(mockEnvironmentProvider.read).mockReturnValue(noAiEnvironment);

      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue([mockRecord]);

      const result = await service.runCheck(24);

      expect(result.checked).toBe(1);
      expect(result.updates).toBe(1);
      expect(mockIngestEntryUseCase.execute).toHaveBeenCalled();
      expect(mockDependencyAlertGateway.analyze).not.toHaveBeenCalled();
    });

    it('should handle missing API key gracefully', async () => {
      const noKeyEnvironment = {
        ...mockEnvironment,
        dependencyWatcherAiApiKey: '',
        defaultChatAiApiKey: '',
      };
      vi.mocked(mockEnvironmentProvider.read).mockReturnValue(noKeyEnvironment);

      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue([mockRecord]);

      const result = await service.runCheck(24);

      expect(result.checked).toBe(1);
      expect(result.updates).toBe(1);
      expect(mockDependencyAlertGateway.analyze).not.toHaveBeenCalled();
    });

    it('should log error when no strategy available for ecosystem', async () => {
      const unsupportedRecord = {
        ...mockRecord,
        ecosystem: DependencyEcosystem.Gradle,
      };

      vi.mocked(mockRegistryStrategyProvider.getStrategy).mockReturnValue(undefined);
      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue([unsupportedRecord]);

      const result = await service.runCheck(24);

      expect(result.checked).toBe(1);
      expect(result.updates).toBe(0);
      expect(result.errors).toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'dependency_watcher_no_strategy',
        expect.objectContaining({
          ecosystem: DependencyEcosystem.Gradle,
        }),
      );
    });

    it('should process multiple packages in batch', async () => {
      const records = [
        mockRecord,
        { ...mockRecord, id: 'record-456', packageName: 'lodash', currentVersion: '4.17.0' },
      ];

      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue(records);
      vi.mocked(mockDependencyAlertGateway.analyze).mockResolvedValue(mockAnalysis);

      const result = await service.runCheck(24);

      expect(result.checked).toBe(2);
      expect(result.updates).toBe(2);
      expect(mockIngestEntryUseCase.execute).toHaveBeenCalledTimes(2);
    });

    it('should continue processing other packages when one fails', async () => {
      const records = [
        mockRecord,
        { ...mockRecord, id: 'record-456', packageName: 'lodash' },
      ];

      mockFetchLatestVersion
        .mockResolvedValueOnce(mockVersionInfo)
        .mockRejectedValueOnce(new Error('registry unavailable'));

      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue(records);
      vi.mocked(mockDependencyAlertGateway.analyze).mockResolvedValue(mockAnalysis);

      const result = await service.runCheck(24);

      expect(result.checked).toBe(2);
      expect(result.updates).toBe(1);
      expect(result.errors).toBe(1);
      expect(mockIngestEntryUseCase.execute).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'dependency_watcher_check_package_failed',
        expect.objectContaining({ packageName: 'lodash' }),
      );
    });

    it('should skip packages when workspace-level watcher is disabled', async () => {
      vi.mocked(mockDependencyWatcherRepository.isWorkspaceEnabled).mockResolvedValue(false);
      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue([mockRecord]);

      const result = await service.runCheck(24);

      expect(result.checked).toBe(0);
      expect(result.updates).toBe(0);
      expect(mockFetchLatestVersion).not.toHaveBeenCalled();
    });

    it('should update lastCheckedAt even when no update available', async () => {
      mockFetchLatestVersion.mockResolvedValue({ version: '4.18.0', repositoryUrl: '' });
      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue([mockRecord]);

      await service.runCheck(24);

      expect(mockDependencyWatcherRepository.update).toHaveBeenCalledWith(
        mockRecord.id,
        expect.objectContaining({
          lastCheckedAt: expect.any(Date),
        }),
      );
    });
  });
});
