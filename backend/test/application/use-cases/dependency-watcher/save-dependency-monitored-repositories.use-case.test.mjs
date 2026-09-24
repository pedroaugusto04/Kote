import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { SaveDependencyMonitoredRepositoriesUseCase } from '../../../../dist/application/use-cases/dependency-watcher/save-dependency-monitored-repositories.use-case.js';

describe('Backend: Save Dependency Monitored Repositories Use Case', () => {
  let useCase;
  let mockDependencyWatcherRepository;
  let mockContentRepository;
  let mockGithubRepositoryResolution;
  let mockImportUseCase;
  let calls;

  beforeEach(() => {
    calls = {
      deleteByRepositoryIds: [],
      setMonitoredRepositories: [],
      importExecute: [],
    };

    mockDependencyWatcherRepository = {
      listMonitoredRepositoryIds: async () => ['repo-kb-1', 'repo-kb-2'],
      deleteByRepositoryIds: async (...args) => {
        calls.deleteByRepositoryIds.push(args);
      },
      setMonitoredRepositories: async (...args) => {
        calls.setMonitoredRepositories.push(args);
      },
    };

    mockContentRepository = {
      getWorkspaceBySlug: async (userId, slug) => {
        if (slug === 'missing') return null;
        return { id: 'workspace-1', workspaceSlug: 'acme' };
      },
      listProjects: async () => [
        {
          workspaceSlug: 'acme',
          repositories: [
            { id: 'repo-kb-1', externalId: 101, fullName: 'acme/backend' },
            { id: 'repo-kb-2', externalId: 102, fullName: 'acme/frontend' },
          ],
        },
      ],
    };

    mockGithubRepositoryResolution = {
      resolveSelectedRepositories: async () => [
        { id: 'repo-kb-1', externalId: 101, fullName: 'acme/backend' },
      ],
    };

    mockImportUseCase = {
      execute: async (...args) => {
        calls.importExecute.push(args);
        return { total: 3, imported: 3, skipped: 0, repositories: 1 };
      },
    };

    useCase = new SaveDependencyMonitoredRepositoriesUseCase(
      mockDependencyWatcherRepository,
      mockContentRepository,
      mockGithubRepositoryResolution,
      mockImportUseCase,
    );
  });

  it('throws when workspace does not exist', async () => {
    await assert.rejects(
      async () => {
        await useCase.execute('user-1', 'missing', []);
      },
      (err) => err instanceof NotFoundException,
    );
  });

  it('rejects repositories that are not linked to workspace projects', async () => {
    await assert.rejects(
      async () => {
        await useCase.execute('user-1', 'acme', ['999']);
      },
      (err) => err instanceof BadRequestException,
    );
  });

  it('removes dependency records for deselected repositories and imports selected ones', async () => {
    const result = await useCase.execute('user-1', 'acme', ['101']);

    assert.deepEqual(calls.deleteByRepositoryIds[0], ['user-1', 'workspace-1', ['repo-kb-2']]);
    assert.deepEqual(calls.setMonitoredRepositories[0], ['user-1', 'workspace-1', ['repo-kb-1']]);
    assert.deepEqual(calls.importExecute[0], ['user-1', 'acme', { repositoryIds: ['repo-kb-1'] }]);
    assert.deepEqual(result, {
      monitored: 1,
      import: { total: 3, imported: 3, skipped: 0, repositories: 1 },
    });
  });

  it('clears all monitored repositories when selection is empty', async () => {
    const result = await useCase.execute('user-1', 'acme', []);

    assert.deepEqual(calls.deleteByRepositoryIds[0], ['user-1', 'workspace-1', ['repo-kb-1', 'repo-kb-2']]);
    assert.deepEqual(calls.setMonitoredRepositories[0], ['user-1', 'workspace-1', []]);
    assert.equal(calls.importExecute.length, 0);
    assert.equal(result.monitored, 0);
  });
});
