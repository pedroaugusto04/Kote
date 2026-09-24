import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException } from '@nestjs/common';

import { ListProjectDependenciesUseCase } from '../../../../dist/application/use-cases/dependency-watcher/list-project-dependencies.use-case.js';
import { DependencyEcosystem } from '../../../../dist/domain/enums/dependency.enums.js';

describe('Backend: List Project Dependencies Use Case', () => {
  let useCase;
  let mockDependencyWatcherRepository;
  let mockContentRepository;
  let calls;

  beforeEach(() => {
    calls = {
      findByRepositoryIds: [],
    };

    mockDependencyWatcherRepository = {
      listMonitoredRepositoryIds: async () => ['repo-kb-1'],
      findByRepositoryIds: async (...args) => {
        calls.findByRepositoryIds.push(args);
        return [
          {
            id: 'dep-1',
            ecosystem: DependencyEcosystem.Npm,
            packageName: 'express',
            currentVersion: '4.18.0',
            latestSeenVersion: '4.19.0',
            lastCheckedAt: new Date('2026-07-28T12:00:00.000Z'),
            enabled: true,
            repositoryId: 'repo-kb-1',
          },
        ];
      },
    };

    mockContentRepository = {
      listProjects: async () => [
        {
          id: 'project-1',
          projectSlug: 'backend',
          workspaceSlug: 'acme',
          repositories: [
            { id: 'repo-kb-1', fullName: 'acme/backend' },
            { id: 'repo-kb-2', fullName: 'acme/frontend' },
          ],
        },
      ],
      getWorkspaceBySlug: async (userId, slug) => ({ id: 'workspace-1', workspaceSlug: slug }),
    };

    useCase = new ListProjectDependenciesUseCase(
      mockDependencyWatcherRepository,
      mockContentRepository,
    );
  });

  it('throws when project does not exist', async () => {
    await assert.rejects(
      async () => {
        await useCase.execute('user-1', 'missing', 'backend');
      },
      (err) => err instanceof NotFoundException,
    );
  });

  it('returns dependencies grouped by monitored repository', async () => {
    const result = await useCase.execute('user-1', 'project-1', 'backend');

    assert.deepEqual(calls.findByRepositoryIds[0], ['user-1', 'workspace-1', ['repo-kb-1']]);
    assert.equal(result.total, 1);
    assert.equal(result.workspaceSlug, 'acme');
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].repositoryId, 'repo-kb-1');
    assert.equal(result.groups[0].repositoryFullName, 'acme/backend');
    assert.equal(result.groups[0].dependencies.length, 1);
    assert.equal(result.groups[0].dependencies[0].packageName, 'express');
    assert.equal(result.groups[0].dependencies[0].currentVersion, '4.18.0');
    assert.equal(result.groups[0].dependencies[0].latestSeenVersion, '4.19.0');
    assert.equal(result.groups[0].dependencies[0].ecosystem, DependencyEcosystem.Npm);
  });

  it('returns empty groups when project repositories are not monitored', async () => {
    mockDependencyWatcherRepository.listMonitoredRepositoryIds = async () => [];

    const result = await useCase.execute('user-1', 'project-1', 'backend');

    assert.deepEqual(result, { projectSlug: 'backend', workspaceSlug: 'acme', groups: [], total: 0 });
    assert.equal(calls.findByRepositoryIds.length, 0);
  });
});
