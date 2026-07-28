import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { ListProjectDependenciesUseCase } from '../../../../src/application/use-cases/dependency-watcher/list-project-dependencies.use-case.js';
import { DependencyWatcherRepository } from '../../../../src/application/ports/dependency-watcher/dependency-watcher.repository.js';
import { ContentRepository } from '../../../../src/application/ports/notes/content.repository.js';
import { DependencyEcosystem } from '../../../../src/domain/enums/dependency.enums.js';

describe('Backend: List Project Dependencies Use Case', () => {
  let useCase: ListProjectDependenciesUseCase;
  let mockDependencyWatcherRepository: DependencyWatcherRepository;
  let mockContentRepository: ContentRepository;

  beforeEach(() => {
    mockDependencyWatcherRepository = {
      listMonitoredRepositoryIds: vi.fn().mockResolvedValue(['repo-kb-1']),
      findByRepositoryIds: vi.fn().mockResolvedValue([
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
      ]),
    } as unknown as DependencyWatcherRepository;

    mockContentRepository = {
      listProjects: vi.fn().mockResolvedValue([
        {
          id: 'project-1',
          projectSlug: 'backend',
          workspaceSlug: 'acme',
          repositories: [
            { id: 'repo-kb-1', fullName: 'acme/backend' },
            { id: 'repo-kb-2', fullName: 'acme/frontend' },
          ],
        },
      ]),
      getWorkspaceBySlug: vi.fn().mockResolvedValue({ id: 'workspace-1', workspaceSlug: 'acme' }),
    } as unknown as ContentRepository;

    useCase = new ListProjectDependenciesUseCase(
      mockDependencyWatcherRepository,
      mockContentRepository,
    );
  });

  it('throws when project does not exist', async () => {
    await expect(useCase.execute('user-1', 'missing', 'backend')).rejects.toThrow(NotFoundException);
  });

  it('returns dependencies grouped by monitored repository', async () => {
    const result = await useCase.execute('user-1', 'project-1', 'backend');

    expect(mockDependencyWatcherRepository.findByRepositoryIds).toHaveBeenCalledWith('user-1', 'workspace-1', ['repo-kb-1']);
    expect(result.total).toBe(1);
    expect(result.groups).toEqual([
      {
        repositoryId: 'repo-kb-1',
        repositoryFullName: 'acme/backend',
        dependencies: [
          {
            id: 'dep-1',
            ecosystem: DependencyEcosystem.Npm,
            packageName: 'express',
            currentVersion: '4.18.0',
            latestSeenVersion: '4.19.0',
            lastCheckedAt: '2026-07-28T12:00:00.000Z',
            enabled: true,
          },
        ],
      },
    ]);
  });

  it('returns empty groups when project repositories are not monitored', async () => {
    vi.mocked(mockDependencyWatcherRepository.listMonitoredRepositoryIds).mockResolvedValue([]);

    const result = await useCase.execute('user-1', 'project-1', 'backend');

    expect(result).toEqual({ projectSlug: 'backend', groups: [], total: 0 });
    expect(mockDependencyWatcherRepository.findByRepositoryIds).not.toHaveBeenCalled();
  });
});
