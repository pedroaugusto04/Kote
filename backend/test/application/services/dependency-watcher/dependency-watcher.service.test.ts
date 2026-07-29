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
import { ContentRepository } from '../../../../src/application/ports/notes/content.repository.js';
import { AppLogger } from '../../../../src/observability/logger.js';
import { RabbitMqDependencyCheckQueuePublisher } from '../../../../src/infrastructure/queue/rabbitmq-dependency-check-queue.publisher.js';
import { RabbitMqDependencyImportQueuePublisher } from '../../../../src/infrastructure/queue/rabbitmq-dependency-import-queue.publisher.js';
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
  let mockContentRepository: ContentRepository;
  let mockDependencyCheckQueuePublisher: RabbitMqDependencyCheckQueuePublisher;
  let mockDependencyImportQueuePublisher: RabbitMqDependencyImportQueuePublisher;
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
    lastUrgency: null,
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
      findEnabledWorkspaces: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      isWorkspaceEnabled: vi.fn().mockResolvedValue(true),
    } as unknown as DependencyWatcherRepository;

    mockDependencyAlertGateway = {
      analyze: vi.fn(),
    } as unknown as DependencyAlertGateway;

    mockRegistryStrategyProvider = {
      getStrategy: vi.fn().mockReturnValue({
        ecosystem: DependencyEcosystem.Npm,
        fetchLatestVersion: mockFetchLatestVersion,
      } as unknown as RegistryStrategy),
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
      info: vi.fn(),
    } as unknown as AppLogger;

    mockUserRepository = {
      findUserById: vi.fn().mockResolvedValue({ email: 'user@example.com' }),
    } as unknown as UserRepository;

    mockContentRepository = {
      listProjects: vi.fn().mockResolvedValue([
        {
          projectSlug: 'my-project',
          workspaceSlug: 'test-workspace',
          repositories: [{ id: 'repo-123', fullName: 'owner/repo' }],
        },
      ]),
      getWorkspaceById: vi.fn().mockResolvedValue({
        id: 'workspace-123',
        userId: 'user-123',
        workspaceSlug: 'test-workspace',
      }),
    } as unknown as ContentRepository;

    mockDependencyCheckQueuePublisher = {
      publish: vi.fn(),
    } as unknown as RabbitMqDependencyCheckQueuePublisher;

    mockDependencyImportQueuePublisher = {
      publish: vi.fn(),
    } as unknown as RabbitMqDependencyImportQueuePublisher;

    service = new DependencyWatcherService(
      mockDependencyWatcherRepository,
      mockDependencyAlertGateway,
      mockRegistryStrategyProvider,
      mockIngestEntryUseCase,
      mockEmailService,
      mockEnvironmentProvider,
      mockUserRepository,
      mockContentRepository,
      mockDependencyCheckQueuePublisher,
      mockDependencyImportQueuePublisher,
      mockLogger,
    );
  });

  describe('Business Rules', () => {
    it('should queue check jobs for enabled workspaces', async () => {
      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue([mockRecord]);

      const result = await service.runCheck(24);

      expect(result.queued).toBe(1);
      expect(result.workspaces).toBe(1);
      expect(mockDependencyCheckQueuePublisher.publish).toHaveBeenCalled();
    });

    it('should skip disabled workspaces', async () => {
      vi.mocked(mockDependencyWatcherRepository.isWorkspaceEnabled).mockResolvedValue(false);
      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue([mockRecord]);

      const result = await service.runCheck(24);

      expect(result.queued).toBe(0);
      expect(result.workspaces).toBe(0);
      expect(mockDependencyCheckQueuePublisher.publish).not.toHaveBeenCalled();
    });

    it('should return zero when no dependencies are due for check', async () => {
      vi.mocked(mockDependencyWatcherRepository.findDueForCheck).mockResolvedValue([]);

      const result = await service.runCheck(24);

      expect(result.queued).toBe(0);
      expect(result.workspaces).toBe(0);
      expect(mockDependencyCheckQueuePublisher.publish).not.toHaveBeenCalled();
    });

    it('should queue import jobs for enabled workspaces', async () => {
      vi.mocked(mockDependencyWatcherRepository.findEnabledWorkspaces).mockResolvedValue([
        {
          id: 'workspace-123',
          userId: 'user-123',
          workspaceSlug: 'test-workspace',
        },
      ]);

      const result = await service.runImport();

      expect(result.queued).toBe(1);
      expect(result.workspaces).toBe(1);
      expect(mockDependencyImportQueuePublisher.publish).toHaveBeenCalled();
    });

    it('should return zero when no workspaces are enabled for import', async () => {
      vi.mocked(mockDependencyWatcherRepository.findEnabledWorkspaces).mockResolvedValue([]);

      const result = await service.runImport();

      expect(result.queued).toBe(0);
      expect(result.workspaces).toBe(0);
      expect(mockDependencyImportQueuePublisher.publish).not.toHaveBeenCalled();
    });

    it('should skip disabled workspaces during import', async () => {
      vi.mocked(mockDependencyWatcherRepository.findEnabledWorkspaces).mockResolvedValue([
        {
          id: 'workspace-123',
          userId: 'user-123',
          workspaceSlug: 'test-workspace',
        },
      ]);
      vi.mocked(mockDependencyWatcherRepository.isWorkspaceEnabled).mockResolvedValue(false);

      const result = await service.runImport();

      expect(result.queued).toBe(0);
      expect(result.workspaces).toBe(0);
      expect(mockDependencyImportQueuePublisher.publish).not.toHaveBeenCalled();
    });
  });
});
