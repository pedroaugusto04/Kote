import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { DependencyWatcherService } from '../../../../dist/application/services/dependency-watcher/dependency-watcher.service.js';
import { DependencyEcosystem } from '../../../../dist/domain/enums/dependency.enums.js';
import { AiProvider } from '../../../../dist/contracts/enums.js';

describe('Backend: Dependency Watcher Service', () => {
  let service;
  let mockDependencyWatcherRepository;
  let mockDependencyAlertGateway;
  let mockRegistryStrategyProvider;
  let mockIngestEntryUseCase;
  let mockEmailService;
  let mockEnvironmentProvider;
  let mockUserRepository;
  let mockContentRepository;
  let mockDependencyCheckQueuePublisher;
  let mockDependencyImportQueuePublisher;
  let mockLogger;
  let checkPublished;
  let importPublished;

  const mockRecord = {
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

  const mockEnvironment = {
    dependencyWatcherAiProvider: AiProvider.OpenAi,
    dependencyWatcherAiBaseUrl: 'https://api.openai.com',
    dependencyWatcherAiModel: 'gpt-4',
    dependencyWatcherAiApiKey: 'sk-test',
    defaultChatAiProvider: AiProvider.OpenAi,
    defaultChatAiBaseUrl: 'https://api.openai.com',
    defaultChatAiModel: 'gpt-4',
    defaultChatAiApiKey: 'sk-test',
    apiPublicBaseUrl: 'https://api.example.com',
  };

  beforeEach(() => {
    checkPublished = [];
    importPublished = [];

    mockDependencyWatcherRepository = {
      findDueForCheck: async () => [],
      findEnabledWorkspaces: async () => [],
      update: async () => {},
      isWorkspaceEnabled: async () => true,
      listMonitoredRepositoryIds: async () => ['repo-123'],
    };

    mockDependencyAlertGateway = {
      analyze: async () => {},
    };

    mockRegistryStrategyProvider = {
      getStrategy: () => ({
        ecosystem: DependencyEcosystem.Npm,
        fetchLatestVersion: async () => ({
          version: '4.19.0',
          repositoryUrl: 'https://github.com/expressjs/express',
        }),
      }),
    };

    mockIngestEntryUseCase = {
      execute: async () => {},
    };

    mockEmailService = {
      sendEmail: async () => {},
    };

    mockEnvironmentProvider = {
      read: () => mockEnvironment,
    };

    mockLogger = {
      error: () => {},
      info: () => {},
      warn: () => {},
    };

    mockUserRepository = {
      findUserById: async () => ({ email: 'user@example.com' }),
    };

    mockContentRepository = {
      listProjects: async () => [
        {
          projectSlug: 'my-project',
          workspaceSlug: 'test-workspace',
          repositories: [{ id: 'repo-123', fullName: 'owner/repo' }],
        },
      ],
      getWorkspaceById: async () => ({
        id: 'workspace-123',
        userId: 'user-123',
        workspaceSlug: 'test-workspace',
      }),
    };

    mockDependencyCheckQueuePublisher = {
      publish: async (item) => {
        checkPublished.push(item);
      },
    };

    mockDependencyImportQueuePublisher = {
      publish: async (item) => {
        importPublished.push(item);
      },
    };

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
      mockDependencyWatcherRepository.findDueForCheck = async () => [mockRecord];

      const result = await service.runCheck(24);

      assert.equal(result.queued, 1);
      assert.equal(result.workspaces, 1);
      assert.equal(checkPublished.length, 1);
    });

    it('should skip disabled workspaces', async () => {
      mockDependencyWatcherRepository.isWorkspaceEnabled = async () => false;
      mockDependencyWatcherRepository.findDueForCheck = async () => [mockRecord];

      const result = await service.runCheck(24);

      assert.equal(result.queued, 0);
      assert.equal(result.workspaces, 0);
      assert.equal(checkPublished.length, 0);
    });

    it('should return zero when no dependencies are due for check', async () => {
      mockDependencyWatcherRepository.findDueForCheck = async () => [];

      const result = await service.runCheck(24);

      assert.equal(result.queued, 0);
      assert.equal(result.workspaces, 0);
      assert.equal(checkPublished.length, 0);
    });

    it('should queue import jobs for enabled workspaces', async () => {
      mockDependencyWatcherRepository.findEnabledWorkspaces = async () => [
        {
          id: 'workspace-123',
          userId: 'user-123',
          workspaceSlug: 'test-workspace',
        },
      ];

      const result = await service.runImport();

      assert.equal(result.queued, 1);
      assert.equal(result.workspaces, 1);
      assert.equal(importPublished.length, 1);
    });

    it('should return zero when no workspaces are enabled for import', async () => {
      mockDependencyWatcherRepository.findEnabledWorkspaces = async () => [];

      const result = await service.runImport();

      assert.equal(result.queued, 0);
      assert.equal(result.workspaces, 0);
      assert.equal(importPublished.length, 0);
    });

    it('should skip disabled workspaces during import', async () => {
      mockDependencyWatcherRepository.findEnabledWorkspaces = async () => [
        {
          id: 'workspace-123',
          userId: 'user-123',
          workspaceSlug: 'test-workspace',
        },
      ];
      mockDependencyWatcherRepository.isWorkspaceEnabled = async () => false;

      const result = await service.runImport();

      assert.equal(result.queued, 0);
      assert.equal(importPublished.length, 0);
    });
  });
});
