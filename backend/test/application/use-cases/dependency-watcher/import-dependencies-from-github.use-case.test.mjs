import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException } from '@nestjs/common';

import { ImportDependenciesFromGithubUseCase } from '../../../../dist/application/use-cases/dependency-watcher/import-dependencies-from-github.use-case.js';
import { CredentialRecordStatus } from '../../../../dist/contracts/enums.js';

describe('Backend: Import Dependencies From GitHub Use Case', () => {
  let useCase;
  let mockDependencyWatcherRepository;
  let mockContentRepository;
  let mockCredentialRepository;
  let mockDependencyImportQueuePublisher;
  let mockLogger;
  let publishedJobs;

  beforeEach(() => {
    publishedJobs = [];

    mockDependencyWatcherRepository = {
      upsert: async () => {},
    };

    mockContentRepository = {
      getWorkspaceBySlug: async (userId, slug) => {
        if (slug === 'nonexistent-workspace') return null;
        return { id: 'workspace-123', workspaceSlug: slug };
      },
      listProjects: async () => [
        {
          id: 'project-1',
          workspaceSlug: 'test-workspace',
          repositories: [{ id: 'repo-1', fullName: 'owner/repo1' }],
        },
        {
          id: 'project-2',
          workspaceSlug: 'test-workspace',
          repositories: [{ id: 'repo-2', fullName: 'owner/repo2' }],
        },
      ],
    };

    mockCredentialRepository = {
      findCredential: async (userId, workspaceSlug) => {
        if (workspaceSlug === 'no-cred-workspace') return null;
        return {
          status: CredentialRecordStatus.Connected,
          revokedAt: null,
        };
      },
    };

    mockDependencyImportQueuePublisher = {
      publish: async (job) => {
        publishedJobs.push(job);
      },
    };

    mockLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    useCase = new ImportDependenciesFromGithubUseCase(
      mockDependencyWatcherRepository,
      mockContentRepository,
      mockCredentialRepository,
      mockDependencyImportQueuePublisher,
      mockLogger,
    );
  });

  describe('Business Rules', () => {
    it('should throw NotFoundException when workspace does not exist', async () => {
      await assert.rejects(
        async () => {
          await useCase.execute('user-123', 'nonexistent-workspace');
        },
        (err) => err instanceof NotFoundException && err.message === 'workspace_not_found',
      );
    });

    it('should return empty result when workspace has no projects', async () => {
      mockContentRepository.listProjects = async () => [];

      const result = await useCase.execute('user-123', 'test-workspace');

      assert.equal(result.queued, 0);
      assert.equal(result.repositories, 0);
      assert.ok(result.jobId);
      assert.equal(publishedJobs.length, 0);
    });

    it('should throw NotFoundException when GitHub credential is missing', async () => {
      mockContentRepository.listProjects = async () => [
        {
          id: 'project-no-cred',
          workspaceSlug: 'no-cred-workspace',
          repositories: [{ id: 'repo-no-cred', fullName: 'owner/no-cred' }],
        },
      ];

      await assert.rejects(
        async () => {
          await useCase.execute('user-123', 'no-cred-workspace');
        },
        (err) => err instanceof NotFoundException && err.message === 'github_credential_not_found',
      );
    });

    it('should filter projects when projectIds are provided', async () => {
      const result = await useCase.execute('user-123', 'test-workspace', { projectIds: ['project-1'] });

      assert.equal(result.queued, 1);
      assert.equal(result.repositories, 1);
      assert.equal(publishedJobs.length, 1);
      assert.deepEqual(publishedJobs[0].projectIds, ['project-1']);
      assert.equal(publishedJobs[0].workspaceSlug, 'test-workspace');
    });

    it('should process all projects when projectIds is not provided', async () => {
      const result = await useCase.execute('user-123', 'test-workspace');

      assert.equal(result.queued, 2);
      assert.equal(result.repositories, 2);
      assert.equal(publishedJobs.length, 1);
      assert.equal(publishedJobs[0].workspaceSlug, 'test-workspace');
    });

    it('should filter by repositoryIds when provided', async () => {
      const result = await useCase.execute('user-123', 'test-workspace', { repositoryIds: ['repo-2'] });

      assert.equal(result.queued, 1);
      assert.equal(result.repositories, 1);
      assert.equal(publishedJobs.length, 1);
      assert.deepEqual(publishedJobs[0].repositoryIds, ['repo-2']);
    });
  });
});
