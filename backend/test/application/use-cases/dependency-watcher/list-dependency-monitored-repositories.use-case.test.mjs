import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException } from '@nestjs/common';

import { ListDependencyMonitoredRepositoriesUseCase } from '../../../../dist/application/use-cases/dependency-watcher/list-dependency-monitored-repositories.use-case.js';

describe('Backend: List Dependency Monitored Repositories Use Case', () => {
  let useCase;
  let mockDependencyWatcherRepository;
  let mockContentRepository;
  let mockGithubRepositoryResolution;
  let githubResolutionCalls;

  beforeEach(() => {
    githubResolutionCalls = 0;
    mockDependencyWatcherRepository = {
      listMonitoredRepositoryIds: async () => ['repo-kb-1'],
    };

    mockContentRepository = {
      getWorkspaceBySlug: async (userId, slug) => {
        if (slug === 'missing') return null;
        return { id: 'workspace-1', workspaceSlug: 'acme' };
      },
      listProjects: async () => [
        {
          displayName: 'Backend',
          workspaceSlug: 'acme',
          repositories: [{ id: 'repo-kb-1', fullName: 'acme/backend', externalId: 101 }],
        },
        {
          displayName: 'Frontend',
          workspaceSlug: 'acme',
          repositories: [{ id: 'repo-kb-2', fullName: 'acme/frontend', externalId: 102 }],
        },
      ],
    };

    mockGithubRepositoryResolution = {
      listAccessibleRepositories: async () => {
        githubResolutionCalls++;
        return [
          { id: 101, fullName: 'acme/backend', private: true },
          { id: 102, fullName: 'acme/frontend', private: false },
          { id: 999, fullName: 'acme/unlinked', private: false },
        ];
      },
    };

    useCase = new ListDependencyMonitoredRepositoriesUseCase(
      mockDependencyWatcherRepository,
      mockContentRepository,
      mockGithubRepositoryResolution,
    );
  });

  it('throws when workspace does not exist', async () => {
    await assert.rejects(
      async () => {
        await useCase.execute('user-1', 'missing');
      },
      (err) => err instanceof NotFoundException,
    );
  });

  it('returns only project-linked accessible repositories with monitored flag', async () => {
    const result = await useCase.execute('user-1', 'acme');

    assert.deepEqual(result.repositories, [
      {
        id: '101',
        fullName: 'acme/backend',
        private: true,
        monitored: true,
        projectNames: ['Backend'],
      },
      {
        id: '102',
        fullName: 'acme/frontend',
        private: false,
        monitored: false,
        projectNames: ['Frontend'],
      },
    ]);
  });

  it('returns empty list when no projects are linked', async () => {
    mockContentRepository.listProjects = async () => [];

    const result = await useCase.execute('user-1', 'acme');

    assert.deepEqual(result.repositories, []);
    assert.equal(githubResolutionCalls, 0);
  });
});
