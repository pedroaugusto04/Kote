import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { SaveDependencyMonitoredRepositoriesUseCase } from '../../../../src/application/use-cases/dependency-watcher/save-dependency-monitored-repositories.use-case.js';
import { DependencyWatcherRepository } from '../../../../src/application/ports/dependency-watcher/dependency-watcher.repository.js';
import { ContentRepository } from '../../../../src/application/ports/notes/content.repository.js';
import { GithubRepositoryResolutionService } from '../../../../src/application/services/integrations/github-repository-resolution.service.js';
import { ImportDependenciesFromGithubUseCase } from '../../../../src/application/use-cases/dependency-watcher/import-dependencies-from-github.use-case.js';

describe('Backend: Save Dependency Monitored Repositories Use Case', () => {
  let useCase: SaveDependencyMonitoredRepositoriesUseCase;
  let mockDependencyWatcherRepository: DependencyWatcherRepository;
  let mockContentRepository: ContentRepository;
  let mockGithubRepositoryResolution: GithubRepositoryResolutionService;
  let mockImportUseCase: ImportDependenciesFromGithubUseCase;

  beforeEach(() => {
    mockDependencyWatcherRepository = {
      listMonitoredRepositoryIds: vi.fn().mockResolvedValue(['repo-kb-1', 'repo-kb-2']),
      deleteByRepositoryIds: vi.fn(),
      setMonitoredRepositories: vi.fn(),
    } as unknown as DependencyWatcherRepository;

    mockContentRepository = {
      getWorkspaceBySlug: vi.fn().mockResolvedValue({ id: 'workspace-1', workspaceSlug: 'acme' }),
      listProjects: vi.fn().mockResolvedValue([
        {
          workspaceSlug: 'acme',
          repositories: [
            { id: 'repo-kb-1', externalId: 101, fullName: 'acme/backend' },
            { id: 'repo-kb-2', externalId: 102, fullName: 'acme/frontend' },
          ],
        },
      ]),
    } as unknown as ContentRepository;

    mockGithubRepositoryResolution = {
      resolveSelectedRepositories: vi.fn().mockResolvedValue([
        { id: 'repo-kb-1', externalId: 101, fullName: 'acme/backend' },
      ]),
    } as unknown as GithubRepositoryResolutionService;

    mockImportUseCase = {
      execute: vi.fn().mockResolvedValue({ total: 3, imported: 3, skipped: 0, repositories: 1 }),
    } as unknown as ImportDependenciesFromGithubUseCase;

    useCase = new SaveDependencyMonitoredRepositoriesUseCase(
      mockDependencyWatcherRepository,
      mockContentRepository,
      mockGithubRepositoryResolution,
      mockImportUseCase,
    );
  });

  it('throws when workspace does not exist', async () => {
    vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue(null);

    await expect(useCase.execute('user-1', 'missing', [])).rejects.toThrow(NotFoundException);
  });

  it('rejects repositories that are not linked to workspace projects', async () => {
    await expect(useCase.execute('user-1', 'acme', ['999'])).rejects.toThrow(BadRequestException);
  });

  it('removes dependency records for deselected repositories and imports selected ones', async () => {
    const result = await useCase.execute('user-1', 'acme', ['101']);

    expect(mockDependencyWatcherRepository.deleteByRepositoryIds).toHaveBeenCalledWith('user-1', 'workspace-1', ['repo-kb-2']);
    expect(mockDependencyWatcherRepository.setMonitoredRepositories).toHaveBeenCalledWith('user-1', 'workspace-1', ['repo-kb-1']);
    expect(mockImportUseCase.execute).toHaveBeenCalledWith('user-1', 'acme', { repositoryIds: ['repo-kb-1'] });
    expect(result).toEqual({
      monitored: 1,
      import: { total: 3, imported: 3, skipped: 0, repositories: 1 },
    });
  });

  it('clears all monitored repositories when selection is empty', async () => {
    const result = await useCase.execute('user-1', 'acme', []);

    expect(mockDependencyWatcherRepository.deleteByRepositoryIds).toHaveBeenCalledWith('user-1', 'workspace-1', ['repo-kb-1', 'repo-kb-2']);
    expect(mockDependencyWatcherRepository.setMonitoredRepositories).toHaveBeenCalledWith('user-1', 'workspace-1', []);
    expect(mockImportUseCase.execute).not.toHaveBeenCalled();
    expect(result.monitored).toBe(0);
  });
});
