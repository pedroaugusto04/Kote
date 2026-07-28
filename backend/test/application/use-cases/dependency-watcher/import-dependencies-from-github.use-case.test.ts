import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportDependenciesFromGithubUseCase } from '../../../../src/application/use-cases/dependency-watcher/import-dependencies-from-github.use-case.js';
import { DependencyWatcherRepository } from '../../../../src/application/ports/dependency-watcher/dependency-watcher.repository.js';
import { GithubIntegrationGateway } from '../../../../src/application/ports/integrations/github-integration.port.js';
import { ContentRepository } from '../../../../src/application/ports/notes/content.repository.js';
import { CredentialRepository } from '../../../../src/application/ports/integrations/integrations.repository.js';
import { AppLogger } from '../../../../src/observability/logger.js';
import { NotFoundException } from '@nestjs/common';
import { DependencyEcosystem } from '../../../../src/domain/enums/dependency.enums.js';

describe('Backend: Import Dependencies From GitHub Use Case', () => {
  let useCase: ImportDependenciesFromGithubUseCase;
  let mockDependencyWatcherRepository: DependencyWatcherRepository;
  let mockGithubGateway: GithubIntegrationGateway;
  let mockContentRepository: ContentRepository;
  let mockCredentialRepository: CredentialRepository;
  let mockLogger: AppLogger;

  beforeEach(() => {
    mockDependencyWatcherRepository = {
      upsert: vi.fn(),
    } as any;

    mockGithubGateway = {
      fetchInstallationToken: vi.fn(),
      fetchFileContent: vi.fn(),
    } as any;

    mockContentRepository = {
      getWorkspaceBySlug: vi.fn(),
      listProjects: vi.fn(),
    } as any;

    mockCredentialRepository = {
      findCredential: vi.fn(),
    } as any;

    mockLogger = {
      error: vi.fn(),
    } as any;

    useCase = new ImportDependenciesFromGithubUseCase(
      mockDependencyWatcherRepository,
      mockGithubGateway,
      {} as any,
      mockContentRepository,
      mockCredentialRepository,
      mockLogger,
    );
  });

  describe('Business Rules', () => {
    it('should throw NotFoundException when workspace does not exist', async () => {
      vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue(null);

      await expect(useCase.execute('user-123', 'nonexistent-workspace')).rejects.toThrow(NotFoundException);
    });

    it('should return empty result when workspace has no projects', async () => {
      vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue({
        id: 'workspace-123',
        workspaceSlug: 'test-workspace',
      } as any);
      vi.mocked(mockContentRepository.listProjects).mockResolvedValue([]);

      const result = await useCase.execute('user-123', 'test-workspace');

      expect(result).toEqual({
        total: 0,
        imported: 0,
        skipped: 0,
        repositories: 0,
      });
    });

    it('should throw NotFoundException when GitHub credential is missing', async () => {
      vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue({
        id: 'workspace-123',
        workspaceSlug: 'test-workspace',
      } as any);
      vi.mocked(mockContentRepository.listProjects).mockResolvedValue([
        {
          workspaceSlug: 'test-workspace',
          repositories: [{ id: 'repo-1', fullName: 'owner/repo' }],
        },
      ] as any);
      vi.mocked(mockCredentialRepository.findCredential).mockResolvedValue(null);

      await expect(useCase.execute('user-123', 'test-workspace')).rejects.toThrow(NotFoundException);
    });

    it('should throw error when GitHub token fetch fails', async () => {
      vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue({
        id: 'workspace-123',
        workspaceSlug: 'test-workspace',
      } as any);
      vi.mocked(mockContentRepository.listProjects).mockResolvedValue([
        {
          workspaceSlug: 'test-workspace',
          repositories: [{ id: 'repo-1', fullName: 'owner/repo' }],
        },
      ] as any);
      vi.mocked(mockCredentialRepository.findCredential).mockResolvedValue({
        publicMetadata: { installationId: 'install-123' },
      } as any);
      vi.mocked(mockGithubGateway.fetchInstallationToken).mockResolvedValue(undefined as any);

      await expect(useCase.execute('user-123', 'test-workspace')).rejects.toThrow('github_token_fetch_failed');
    });

    it('should skip repositories without package.json', async () => {
      vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue({
        id: 'workspace-123',
        workspaceSlug: 'test-workspace',
      } as any);
      vi.mocked(mockContentRepository.listProjects).mockResolvedValue([
        {
          workspaceSlug: 'test-workspace',
          repositories: [{ id: 'repo-1', fullName: 'owner/repo' }],
        },
      ] as any);
      vi.mocked(mockCredentialRepository.findCredential).mockResolvedValue({
        publicMetadata: { installationId: 'install-123' },
      } as any);
      vi.mocked(mockGithubGateway.fetchInstallationToken).mockResolvedValue('token-123');
      vi.mocked(mockGithubGateway.fetchFileContent).mockResolvedValue('');

      const result = await useCase.execute('user-123', 'test-workspace');

      expect(result.total).toBe(0);
      expect(result.imported).toBe(0);
      expect(mockDependencyWatcherRepository.upsert).not.toHaveBeenCalled();
    });

    it('should import both dependencies and devDependencies', async () => {
      const packageJson = {
        dependencies: {
          'express': '^4.18.0',
          'lodash': '~4.17.21',
        },
        devDependencies: {
          'typescript': '^5.0.0',
          'jest': '^29.0.0',
        },
      };

      vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue({
        id: 'workspace-123',
        workspaceSlug: 'test-workspace',
      } as any);
      vi.mocked(mockContentRepository.listProjects).mockResolvedValue([
        {
          workspaceSlug: 'test-workspace',
          repositories: [{ id: 'repo-1', fullName: 'owner/repo' }],
        },
      ] as any);
      vi.mocked(mockCredentialRepository.findCredential).mockResolvedValue({
        publicMetadata: { installationId: 'install-123' },
      } as any);
      vi.mocked(mockGithubGateway.fetchInstallationToken).mockResolvedValue('token-123');
      vi.mocked(mockGithubGateway.fetchFileContent).mockResolvedValue(JSON.stringify(packageJson));

      await useCase.execute('user-123', 'test-workspace');

      expect(mockDependencyWatcherRepository.upsert).toHaveBeenCalledTimes(4);
      expect(mockDependencyWatcherRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          packageName: 'express',
          currentVersion: '4.18.0',
          ecosystem: DependencyEcosystem.Npm,
        }),
      );
      expect(mockDependencyWatcherRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          packageName: 'lodash',
          currentVersion: '4.17.21',
          ecosystem: DependencyEcosystem.Npm,
        }),
      );
      expect(mockDependencyWatcherRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          packageName: 'typescript',
          currentVersion: '5.0.0',
          ecosystem: DependencyEcosystem.Npm,
        }),
      );
      expect(mockDependencyWatcherRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          packageName: 'jest',
          currentVersion: '29.0.0',
          ecosystem: DependencyEcosystem.Npm,
        }),
      );
    });

    it('should clean version prefixes (^, ~)', async () => {
      const packageJson = {
        dependencies: {
          'package-caret': '^1.2.3',
          'package-tilde': '~2.5.0',
          'package-plain': '3.0.0',
        },
      };

      vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue({
        id: 'workspace-123',
        workspaceSlug: 'test-workspace',
      } as any);
      vi.mocked(mockContentRepository.listProjects).mockResolvedValue([
        {
          workspaceSlug: 'test-workspace',
          repositories: [{ id: 'repo-1', fullName: 'owner/repo' }],
        },
      ] as any);
      vi.mocked(mockCredentialRepository.findCredential).mockResolvedValue({
        publicMetadata: { installationId: 'install-123' },
      } as any);
      vi.mocked(mockGithubGateway.fetchInstallationToken).mockResolvedValue('token-123');
      vi.mocked(mockGithubGateway.fetchFileContent).mockResolvedValue(JSON.stringify(packageJson));

      await useCase.execute('user-123', 'test-workspace');

      const calls = vi.mocked(mockDependencyWatcherRepository.upsert).mock.calls;
      expect(calls[0][0].currentVersion).toBe('1.2.3');
      expect(calls[1][0].currentVersion).toBe('2.5.0');
      expect(calls[2][0].currentVersion).toBe('3.0.0');
    });

    it('should update existing dependency records instead of creating duplicates', async () => {
      const packageJson = {
        dependencies: {
          'express': '^4.18.0',
        },
      };

      vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue({
        id: 'workspace-123',
        workspaceSlug: 'test-workspace',
      } as any);
      vi.mocked(mockContentRepository.listProjects).mockResolvedValue([
        {
          workspaceSlug: 'test-workspace',
          repositories: [{ id: 'repo-1', fullName: 'owner/repo' }],
        },
      ] as any);
      vi.mocked(mockCredentialRepository.findCredential).mockResolvedValue({
        publicMetadata: { installationId: 'install-123' },
      } as any);
      vi.mocked(mockGithubGateway.fetchInstallationToken).mockResolvedValue('token-123');
      vi.mocked(mockGithubGateway.fetchFileContent).mockResolvedValue(JSON.stringify(packageJson));

      await useCase.execute('user-123', 'test-workspace');

      expect(mockDependencyWatcherRepository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          workspaceId: 'workspace-123',
          packageName: 'express',
          currentVersion: '4.18.0',
          ecosystem: DependencyEcosystem.Npm,
          repositoryId: 'repo-1',
        }),
      );
    });

    it('should log error and continue when repository fetch fails', async () => {
      vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue({
        id: 'workspace-123',
        workspaceSlug: 'test-workspace',
      } as any);
      vi.mocked(mockContentRepository.listProjects).mockResolvedValue([
        {
          workspaceSlug: 'test-workspace',
          repositories: [
            { id: 'repo-1', fullName: 'owner/repo1' },
            { id: 'repo-2', fullName: 'owner/repo2' },
          ],
        },
      ] as any);
      vi.mocked(mockCredentialRepository.findCredential).mockResolvedValue({
        publicMetadata: { installationId: 'install-123' },
      } as any);
      vi.mocked(mockGithubGateway.fetchInstallationToken).mockResolvedValue('token-123');
      vi.mocked(mockGithubGateway.fetchFileContent)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(JSON.stringify({ dependencies: { 'express': '^4.18.0' } }));

      const result = await useCase.execute('user-123', 'test-workspace');

      expect(result.total).toBe(1);
      expect(result.skipped).toBe(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'dependency_watcher_import_failed',
        expect.objectContaining({
          repository: 'owner/repo1',
        }),
      );
    });

    it('should handle multiple projects with multiple repositories', async () => {
      const packageJson = {
        dependencies: {
          'express': '^4.18.0',
        },
      };

      vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue({
        id: 'workspace-123',
        workspaceSlug: 'test-workspace',
      } as any);
      vi.mocked(mockContentRepository.listProjects).mockResolvedValue([
        {
          workspaceSlug: 'test-workspace',
          repositories: [
            { id: 'repo-1', fullName: 'owner/repo1' },
            { id: 'repo-2', fullName: 'owner/repo2' },
          ],
        },
        {
          workspaceSlug: 'test-workspace',
          repositories: [
            { id: 'repo-3', fullName: 'owner/repo3' },
          ],
        },
      ] as any);
      vi.mocked(mockCredentialRepository.findCredential).mockResolvedValue({
        publicMetadata: { installationId: 'install-123' },
      } as any);
      vi.mocked(mockGithubGateway.fetchInstallationToken).mockResolvedValue('token-123');
      vi.mocked(mockGithubGateway.fetchFileContent).mockResolvedValue(JSON.stringify(packageJson));

      const result = await useCase.execute('user-123', 'test-workspace');

      expect(result.total).toBe(3);
      expect(result.imported).toBe(3);
      expect(result.repositories).toBe(3);
      expect(mockDependencyWatcherRepository.upsert).toHaveBeenCalledTimes(3);
    });

    it('should filter projects when projectIds are provided', async () => {
      const packageJson = {
        dependencies: {
          'express': '^4.18.0',
        },
      };

      vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue({
        id: 'workspace-123',
        workspaceSlug: 'test-workspace',
      } as any);
      vi.mocked(mockContentRepository.listProjects).mockResolvedValue([
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
      ] as any);
      vi.mocked(mockCredentialRepository.findCredential).mockResolvedValue({
        publicMetadata: { installationId: 'install-123' },
      } as any);
      vi.mocked(mockGithubGateway.fetchInstallationToken).mockResolvedValue('token-123');
      vi.mocked(mockGithubGateway.fetchFileContent).mockResolvedValue(JSON.stringify(packageJson));

      const result = await useCase.execute('user-123', 'test-workspace', ['project-1']);

      expect(result.total).toBe(1);
      expect(result.imported).toBe(1);
      expect(result.repositories).toBe(1);
      expect(mockGithubGateway.fetchFileContent).toHaveBeenCalledTimes(1);
      expect(mockGithubGateway.fetchFileContent).toHaveBeenCalledWith('owner/repo1', 'package.json', 'token-123');
    });

    it('should process all projects when projectIds is not provided', async () => {
      const packageJson = {
        dependencies: {
          'express': '^4.18.0',
        },
      };

      vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue({
        id: 'workspace-123',
        workspaceSlug: 'test-workspace',
      } as any);
      vi.mocked(mockContentRepository.listProjects).mockResolvedValue([
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
      ] as any);
      vi.mocked(mockCredentialRepository.findCredential).mockResolvedValue({
        publicMetadata: { installationId: 'install-123' },
      } as any);
      vi.mocked(mockGithubGateway.fetchInstallationToken).mockResolvedValue('token-123');
      vi.mocked(mockGithubGateway.fetchFileContent).mockResolvedValue(JSON.stringify(packageJson));

      const result = await useCase.execute('user-123', 'test-workspace');

      expect(result.total).toBe(2);
      expect(result.imported).toBe(2);
      expect(result.repositories).toBe(2);
      expect(mockGithubGateway.fetchFileContent).toHaveBeenCalledTimes(2);
    });

    it('should detect and parse composer.json for PHP projects', async () => {
      const composerJson = {
        require: {
          'laravel/framework': '^10.0',
          'symfony/console': '^6.0',
        },
        'require-dev': {
          'phpunit/phpunit': '^10.0',
        },
      };

      vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue({
        id: 'workspace-123',
        workspaceSlug: 'test-workspace',
      } as any);
      vi.mocked(mockContentRepository.listProjects).mockResolvedValue([
        {
          workspaceSlug: 'test-workspace',
          repositories: [{ id: 'repo-1', fullName: 'owner/php-repo' }],
        },
      ] as any);
      vi.mocked(mockCredentialRepository.findCredential).mockResolvedValue({
        publicMetadata: { installationId: 'install-123' },
      } as any);
      vi.mocked(mockGithubGateway.fetchInstallationToken).mockResolvedValue('token-123');
      
      // Mock package.json not found, composer.json found
      vi.mocked(mockGithubGateway.fetchFileContent)
        .mockResolvedValueOnce('') // package.json
        .mockResolvedValueOnce(JSON.stringify(composerJson)); // composer.json

      const result = await useCase.execute('user-123', 'test-workspace');

      expect(result.total).toBe(3);
      expect(result.imported).toBe(3);
      expect(mockDependencyWatcherRepository.upsert).toHaveBeenCalledTimes(3);
      
      // Verify ecosystem is Composer
      const calls = vi.mocked(mockDependencyWatcherRepository.upsert).mock.calls;
      expect(calls[0][0].ecosystem).toBe('composer');
      expect(calls[0][0].packageName).toBe('laravel/framework');
    });

    it('should detect and parse Cargo.toml for Rust projects', async () => {
      const cargoToml = `
[dependencies]
serde = "1.0"
tokio = { version = "1.0", features = ["full"] }

[dev-dependencies]
mockito = "0.31"
      `.trim();

      vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue({
        id: 'workspace-123',
        workspaceSlug: 'test-workspace',
      } as any);
      vi.mocked(mockContentRepository.listProjects).mockResolvedValue([
        {
          workspaceSlug: 'test-workspace',
          repositories: [{ id: 'repo-1', fullName: 'owner/rust-repo' }],
        },
      ] as any);
      vi.mocked(mockCredentialRepository.findCredential).mockResolvedValue({
        publicMetadata: { installationId: 'install-123' },
      } as any);
      vi.mocked(mockGithubGateway.fetchInstallationToken).mockResolvedValue('token-123');
      
      // Mock package.json, composer.json not found, Cargo.toml found
      vi.mocked(mockGithubGateway.fetchFileContent)
        .mockResolvedValueOnce('') // package.json
        .mockResolvedValueOnce('') // composer.json
        .mockResolvedValueOnce(cargoToml); // Cargo.toml

      const result = await useCase.execute('user-123', 'test-workspace');

      expect(result.total).toBe(3);
      expect(result.imported).toBe(3);
      expect(mockDependencyWatcherRepository.upsert).toHaveBeenCalledTimes(3);
      
      // Verify ecosystem is Cargo
      const calls = vi.mocked(mockDependencyWatcherRepository.upsert).mock.calls;
      expect(calls[0][0].ecosystem).toBe('cargo');
      expect(calls[0][0].packageName).toBe('serde');
    });

    it('should detect and parse requirements.txt for Python projects', async () => {
      const requirementsTxt = `
django==4.2.0
requests>=2.28.0
pytest~=7.4.0
      `.trim();

      vi.mocked(mockContentRepository.getWorkspaceBySlug).mockResolvedValue({
        id: 'workspace-123',
        workspaceSlug: 'test-workspace',
      } as any);
      vi.mocked(mockContentRepository.listProjects).mockResolvedValue([
        {
          workspaceSlug: 'test-workspace',
          repositories: [{ id: 'repo-1', fullName: 'owner/python-repo' }],
        },
      ] as any);
      vi.mocked(mockCredentialRepository.findCredential).mockResolvedValue({
        publicMetadata: { installationId: 'install-123' },
      } as any);
      vi.mocked(mockGithubGateway.fetchInstallationToken).mockResolvedValue('token-123');
      
      // Mock package.json, composer.json, Cargo.toml not found, requirements.txt found
      vi.mocked(mockGithubGateway.fetchFileContent)
        .mockResolvedValueOnce('') // package.json
        .mockResolvedValueOnce('') // composer.json
        .mockResolvedValueOnce('') // Cargo.toml
        .mockResolvedValueOnce('') // pom.xml
        .mockResolvedValueOnce(requirementsTxt); // requirements.txt

      const result = await useCase.execute('user-123', 'test-workspace');

      expect(result.total).toBe(3);
      expect(result.imported).toBe(3);
      expect(mockDependencyWatcherRepository.upsert).toHaveBeenCalledTimes(3);
      
      // Verify ecosystem is Pip
      const calls = vi.mocked(mockDependencyWatcherRepository.upsert).mock.calls;
      expect(calls[0][0].ecosystem).toBe('pip');
      expect(calls[0][0].packageName).toBe('django');
    });
  });
});
