import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { DependencyWatcherService } from '../../../../dist/application/services/dependency-watcher/dependency-watcher.service.js';
import { DependencyAlertNotificationService } from '../../../../dist/application/services/dependency-watcher/dependency-alert-notification.service.js';
import { DependencyEcosystem } from '../../../../dist/domain/enums/dependency.enums.js';
import { AiProvider } from '../../../../dist/contracts/enums.js';
import { encryptConfig } from '../../../../dist/application/utils/security/credentials-crypto.utils.js';

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
  let mockCredentialRepository;
  let mockGithubGateway;
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
      listProjectsByWorkspace: async () => [
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

    mockCredentialRepository = {
      findCredential: async () => null,
    };

    mockGithubGateway = {
      fetchInstallationToken: async () => '',
      createIssue: async () => null,
    };

    const buildService = (credentialRepo = mockCredentialRepository, githubGw = mockGithubGateway) => {
      const alertNotificationService = new DependencyAlertNotificationService(
        mockIngestEntryUseCase,
        mockEmailService,
        mockEnvironmentProvider,
        mockUserRepository,
        mockContentRepository,
        credentialRepo,
        githubGw,
        mockLogger,
      );
      return new DependencyWatcherService(
        mockDependencyWatcherRepository,
        mockDependencyAlertGateway,
        mockRegistryStrategyProvider,
        alertNotificationService,
        mockEnvironmentProvider,
        mockContentRepository,
        mockDependencyCheckQueuePublisher,
        mockDependencyImportQueuePublisher,
        mockLogger,
      );
    };

    service = buildService();
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

    it('should create a GitHub issue with the heal-agent label when update urgency matches configured urgencies', async () => {
      const createdIssues = [];
      const testEncryptionKey = Buffer.alloc(32, 7).toString('base64');
      mockEnvironmentProvider.read = () => ({
        ...mockEnvironment,
        credentialsEncryptionKey: testEncryptionKey,
        githubAppId: 'app-123',
        githubAppPrivateKey: 'fake-private-key',
        dependencyWatcherGithubIssueUrgencies: ['critical'],
        dependencyWatcherGithubIssueLabel: 'heal-agent',
      });

      mockDependencyAlertGateway.analyze = async () => ({
        urgency: 'critical',
        summary: 'Remote code execution vulnerability fixed in 4.19.0',
        breakingChanges: ['Removed legacy query parser option'],
        nextSteps: ['Upgrade express to 4.19.0'],
      });

      const mockCredentialRepository = {
        findCredential: async () => ({
          status: 'connected',
          revokedAt: null,
          encryptedConfig: encryptConfig({ installationId: 'inst-999' }, mockEnvironmentProvider),
        }),
      };

      const mockGithubGateway = {
        fetchInstallationToken: async ({ appId, installationId }) => {
          assert.equal(appId, 'app-123');
          assert.equal(installationId, 'inst-999');
          return 'ghs_installation_token';
        },
        createIssue: async (input) => {
          createdIssues.push(input);
          return { number: 77, htmlUrl: 'https://github.com/owner/repo/issues/77' };
        },
      };

      const alertNotificationService = new DependencyAlertNotificationService(
        mockIngestEntryUseCase,
        mockEmailService,
        mockEnvironmentProvider,
        mockUserRepository,
        mockContentRepository,
        mockCredentialRepository,
        mockGithubGateway,
        mockLogger,
      );
      const serviceWithGithub = new DependencyWatcherService(
        mockDependencyWatcherRepository,
        mockDependencyAlertGateway,
        mockRegistryStrategyProvider,
        alertNotificationService,
        mockEnvironmentProvider,
        mockContentRepository,
        mockDependencyCheckQueuePublisher,
        mockDependencyImportQueuePublisher,
        mockLogger,
      );

      const updated = await serviceWithGithub.checkPackage(mockRecord);
      assert.equal(updated, true);
      assert.equal(createdIssues.length, 1);
      assert.equal(createdIssues[0].repoFullName, 'owner/repo');
      assert.equal(createdIssues[0].token, 'ghs_installation_token');
      assert.deepEqual(createdIssues[0].labels, ['heal-agent']);
      assert.ok(createdIssues[0].title.includes('[CRITICAL Dependency Update] express: 4.18.0 → 4.19.0'));
      assert.ok(createdIssues[0].body.includes('<!-- kote-dependency:express@4.19.0 -->'));
    });

    it('should create a GitHub issue using dedicated DEPENDENCY_WATCHER_GITHUB_TOKEN without requiring GithubApp credential', async () => {
      const createdIssues = [];
      mockDependencyAlertGateway.analyze = async () => ({
        urgency: 'critical',
        summary: 'Security vulnerability and breaking API change',
        breakingChanges: ['Express 4.19 requires new middleware signatures'],
        nextSteps: ['Run tests after update'],
      });

      const mockCredentialRepository = {
        findCredential: async () => null, // No GitHub App credential connected
      };

      const mockGithubGateway = {
        fetchInstallationToken: async () => {
          throw new Error('Should not be called when dedicated token is configured');
        },
        createIssue: async (input) => {
          createdIssues.push(input);
          return { number: 79, htmlUrl: 'https://github.com/owner/repo/issues/79' };
        },
      };

      mockEnvironmentProvider.read = () => ({
        ...mockEnvironment,
        dependencyWatcherGithubToken: 'ghp_dedicated_pat_token',
        dependencyWatcherGithubIssueUrgencies: ['critical'],
        dependencyWatcherGithubIssueLabel: 'heal-agent',
      });

      const alertNotificationService = new DependencyAlertNotificationService(
        mockIngestEntryUseCase,
        mockEmailService,
        mockEnvironmentProvider,
        mockUserRepository,
        mockContentRepository,
        mockCredentialRepository,
        mockGithubGateway,
        mockLogger,
      );
      const serviceWithDedicatedToken = new DependencyWatcherService(
        mockDependencyWatcherRepository,
        mockDependencyAlertGateway,
        mockRegistryStrategyProvider,
        alertNotificationService,
        mockEnvironmentProvider,
        mockContentRepository,
        mockDependencyCheckQueuePublisher,
        mockDependencyImportQueuePublisher,
        mockLogger,
      );

      const updated = await serviceWithDedicatedToken.checkPackage(mockRecord);
      assert.equal(updated, true);
      assert.equal(createdIssues.length, 1);
      assert.equal(createdIssues[0].repoFullName, 'owner/repo');
      assert.equal(createdIssues[0].token, 'ghp_dedicated_pat_token');
      assert.deepEqual(createdIssues[0].labels, ['heal-agent']);
      assert.ok(createdIssues[0].title.includes('[CRITICAL Dependency Update] express: 4.18.0 → 4.19.0'));
      assert.ok(createdIssues[0].body.includes('<!-- kote-dependency:express@4.19.0 -->'));
    });

    it('should not create a GitHub issue when update urgency is not in configured urgencies', async () => {
      const createdIssues = [];
      mockDependencyAlertGateway.analyze = async () => ({
        urgency: 'optional',
        summary: 'Minor documentation and types update',
        breakingChanges: [],
        nextSteps: [],
      });

      const mockCredentialRepository = {
        findCredential: async () => ({
          status: 'connected',
          revokedAt: null,
          encryptedConfig: JSON.stringify({ installationId: 'inst-999' }),
        }),
      };

      const mockGithubGateway = {
        fetchInstallationToken: async () => 'ghs_installation_token',
        createIssue: async (input) => {
          createdIssues.push(input);
          return { number: 78, htmlUrl: 'https://github.com/owner/repo/issues/78' };
        },
      };

      mockEnvironmentProvider.read = () => ({
        ...mockEnvironment,
        githubAppId: 'app-123',
        githubAppPrivateKey: 'fake-private-key',
        dependencyWatcherGithubIssueUrgencies: ['critical'],
        dependencyWatcherGithubIssueLabel: 'heal-agent',
      });

      const alertNotificationService = new DependencyAlertNotificationService(
        mockIngestEntryUseCase,
        mockEmailService,
        mockEnvironmentProvider,
        mockUserRepository,
        mockContentRepository,
        mockCredentialRepository,
        mockGithubGateway,
        mockLogger,
      );
      const serviceWithGithub = new DependencyWatcherService(
        mockDependencyWatcherRepository,
        mockDependencyAlertGateway,
        mockRegistryStrategyProvider,
        alertNotificationService,
        mockEnvironmentProvider,
        mockContentRepository,
        mockDependencyCheckQueuePublisher,
        mockDependencyImportQueuePublisher,
        mockLogger,
      );

      const updated = await serviceWithGithub.checkPackage(mockRecord);
      assert.equal(updated, true);
      assert.equal(createdIssues.length, 0);
    });
  });
});
