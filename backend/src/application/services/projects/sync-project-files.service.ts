import { Injectable } from '@nestjs/common';

import { ProjectCoverageRepository } from '../../ports/projects/project-coverage.repository.js';
import { GithubIntegrationGateway } from '../../ports/integrations/github-integration.port.js';
import { CredentialRepository } from '../../ports/integrations/integrations.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { CredentialRecordStatus, IntegrationProvider } from '../../../contracts/enums.js';
import { decryptConfig } from '../../utils/security/credentials-crypto.utils.js';
import { AppLogger } from '../../../observability/logger.js';
import { isUuid } from '../../../domain/utils/uuid.utils.js';
import type { ProjectRecord } from '../../models/repository-records.models.js';

@Injectable()
export class SyncProjectFilesService {
  constructor(
    private readonly projectCoverageRepository: ProjectCoverageRepository,
    private readonly githubIntegrationGateway: GithubIntegrationGateway,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly contentRepository: ContentRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Sincroniza arquivos de um projeto quando o chamador possui seu ID (UUID).
   */
  async syncProjectById(userId: string, projectId: string): Promise<number> {
    const project = await this.contentRepository.getProjectById(userId, projectId);
    if (!project) return 0;
    return this.syncProjectEntity(userId, project);
  }

  /**
   * Sincroniza arquivos de um projeto quando o chamador possui seu slug legível (ex: Webhooks).
   */
  async syncProjectBySlug(userId: string, projectSlug: string): Promise<number> {
    const project = await this.contentRepository.getProjectBySlug(userId, projectSlug);
    if (!project) return 0;
    return this.syncProjectEntity(userId, project);
  }

  /**
   * Ponto de entrada polimórfico para compatibilidade reversa.
   */
  async syncProject(userId: string, projectSlugOrId: string): Promise<number> {
    return isUuid(projectSlugOrId)
      ? this.syncProjectById(userId, projectSlugOrId)
      : this.syncProjectBySlug(userId, projectSlugOrId);
  }

  private async syncProjectEntity(userId: string, project: ProjectRecord): Promise<number> {
    const workspaceSlug = project.workspaceSlug || 'default';
    const linkedRepos = project.repositories || [];

    if (linkedRepos.length === 0) return 0;

    // Resolve GitHub token
    const environment = this.environmentProvider.read();
    let token = '';

    if (this.credentialRepository) {
      try {
        const credential = await this.credentialRepository.findCredential(
          userId,
          workspaceSlug,
          IntegrationProvider.GithubApp,
        );
        if (credential && credential.status === CredentialRecordStatus.Connected && !credential.revokedAt) {
          const config = decryptConfig(credential.encryptedConfig, this.environmentProvider) as { installationId?: string };
          const installationId = String(config.installationId || '').trim();
          if (environment.githubAppId && environment.githubAppPrivateKey && installationId) {
            token = await this.githubIntegrationGateway.fetchInstallationToken({
              appId: environment.githubAppId,
              privateKey: environment.githubAppPrivateKey,
              installationId,
            });
          }
        }
      } catch (err) {
        this.logger.warn(`Failed to resolve GitHub installation token for project ${project.projectSlug}:`, { error: String(err) });
      }
    }

    if (!token) return 0;

    // Fetch file trees from all linked repositories
    const allFilePathsSet = new Set<string>();
    let successfulRepositoryFetches = 0;
    for (const repo of linkedRepos) {
      try {
        const paths = await this.githubIntegrationGateway.fetchRepositoryTree(
          repo.fullName,
          repo.defaultBranch || 'main',
          token,
        );
        successfulRepositoryFetches++;
        for (const p of paths) {
          allFilePathsSet.add(p);
        }
      } catch (err) {
        this.logger.error(`Error fetching repo tree for ${repo.fullName}:`, { error: String(err) });
      }
    }

    const allFilePaths = Array.from(allFilePathsSet);
    // Replace the snapshot only when every linked repository was read. A
    // partial result must not delete files belonging to a repository whose
    // GitHub request failed.
    if (successfulRepositoryFetches === linkedRepos.length) {
      await this.projectCoverageRepository.syncProjectFiles(project.id, allFilePaths);
    }

    return allFilePaths.length;
  }
}
