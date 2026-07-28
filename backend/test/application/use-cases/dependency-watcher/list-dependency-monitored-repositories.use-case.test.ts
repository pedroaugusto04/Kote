import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { ListDependencyMonitoredRepositoriesUseCase } from '../../../../src/application/use-cases/dependency-watcher/list-dependency-monitored-repositories.use-case.js';
import { DependencyWatcherRepository } from '../../../../src/application/ports/dependency-watcher/dependency-watcher.repository.js';
import { ContentRepository } from '../../../../src/application/ports/notes/content.repository.js';
import { GithubRepositoryResolutionService } from '../../../../src/application/services/integrations/github-repository-resolution.service.js';

describe('Backend: List Dependency Monitored Repositories Use Case', () => {
  let useCase: ListDependencyMonitoredRepositoriesUseCase;
  let mockDependencyWatcherRepository: DependencyWatcherRepository;
  let mockContentRepository: ContentRepository;
  let mockGithubRepositoryResolution: GithubRepositoryResolutionService;

  beforeEach(() => {
    mockDependencyWatcherRepository = {
      listMonitoredRepositoryIds: vi.fn().mockResolvedValue(['repo-kb-1']),
    } as unknown as DependencyWatcherRepository;

    mockContentRepository = {
      getWorkspaceBySlug: vi.fn().mockResolvedValue({ id: 'workspace-1', workspaceSlug: 'acme' }),
      listProjects: vi.fn().mockResolvedValue([
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
      ]),
    } as unknown as ContentRepository;

    mockGithubRepositoryResolution = {
      listAccessibleRepositories: vi.fn().mockResolvedValue([
        { id: 101, fullName: 'acme/backend', private: true },
        { id: 102, fullName: 'acme/frontend', private: false },
        { id: 999, fullName: 'acme/unlinked', private: false },
      ]),
    } as unknown as GithubRepositoryResolutionService;

    useCase = new ListDependencyMonitoredRepositoriesUseCase(
      mockDependencyWatcherRepository,
      mockContentRepository,
      mockGithubRepositoryResolution,
    );
  });

  it('throws when workspace does not exist', async () => {
    vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue(null);

    await expect(useCase.execute('user-1', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('returns only project-linked accessible repositories with monitored flag', async () => {
    const result = await useCase.execute('user-1', 'acme');

    expect(result.repositories).toEqual([
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
    vi.mocked(mockContentRepository.listProjects).mockResolvedValue([]);

    const result = await useCase.execute('user-1', 'acme');

    expect(result.repositories).toEqual([]);
    expect(mockGithubRepositoryResolution.listAccessibleRepositories).not.toHaveBeenCalled();
  });
});
