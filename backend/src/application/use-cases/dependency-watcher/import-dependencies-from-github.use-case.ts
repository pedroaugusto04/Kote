import { Injectable, NotFoundException } from '@nestjs/common';

import { DependencyWatcherRepository, type CreateDependencyWatchInput } from '../../ports/dependency-watcher/dependency-watcher.repository.js';
import { GithubIntegrationGateway } from '../../ports/integrations/github-integration.port.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { CredentialRepository } from '../../ports/integrations/integrations.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import { cleanVersion } from '../../utils/dependency/version.utils.js';
import { DependencyEcosystem } from '../../../contracts/enums.js';
import { getManifestFilePriority, detectEcosystemFromManifest } from '../../utils/dependency/manifest-detector.utils.js';
import { parseManifestDependencies } from '../../utils/dependency/manifest-parser.utils.js';

type ImportResult = {
  total: number;
  imported: number;
  skipped: number;
  repositories: number;
};

@Injectable()
export class ImportDependenciesFromGithubUseCase {
  constructor(
    private readonly dependencyWatcherRepository: DependencyWatcherRepository,
    private readonly githubGateway: GithubIntegrationGateway,
    private readonly contentRepository: ContentRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly logger: AppLogger,
  ) {}

  async execute(userId: string, workspaceSlug: string, projectIds?: string[]): Promise<ImportResult> {
    const workspace = await this.contentRepository.getWorkspaceBySlug(userId, workspaceSlug);
    if (!workspace) {
      throw new NotFoundException('workspace_not_found');
    }

    const projects = await this.contentRepository.listProjects(userId);
    let workspaceProjects = projects.filter((p) => p.workspaceSlug === workspaceSlug);

    // Filter by specific project IDs if provided
    if (projectIds && projectIds.length > 0) {
      workspaceProjects = workspaceProjects.filter((p) => projectIds.includes(p.id));
    }

    if (workspaceProjects.length === 0) {
      return { total: 0, imported: 0, skipped: 0, repositories: 0 };
    }

    const credential = await this.credentialRepository.findCredential(userId, workspaceSlug, 'github-app');
    if (!credential) {
      throw new NotFoundException('github_credential_not_found');
    }

    const token = await this.githubGateway.fetchInstallationToken({
      appId: String(process.env.KB_GITHUB_APP_ID),
      privateKey: String(process.env.KB_GITHUB_APP_PRIVATE_KEY),
      installationId: credential.publicMetadata.installationId as string,
    });

    if (!token) {
      throw new Error('github_token_fetch_failed');
    }

    let total = 0;
    let imported = 0;
    let skipped = 0;

    for (const project of workspaceProjects) {
      for (const repo of project.repositories) {
        try {
          // Try to find and parse manifest files in priority order
          const manifestFiles = getManifestFilePriority();
          let dependenciesFound = false;

          for (const manifestFile of manifestFiles) {
            const content = await this.githubGateway.fetchFileContent(
              repo.fullName,
              manifestFile,
              token,
            );

            if (!content) {
              continue;
            }

            const ecosystem = detectEcosystemFromManifest(manifestFile);
            if (!ecosystem) {
              continue;
            }

            const dependencies = parseManifestDependencies(manifestFile, content);

            for (const dep of dependencies) {
              total++;
              const cleanedVersion = cleanVersion(dep.version);

              await this.dependencyWatcherRepository.upsert({
                userId,
                workspaceId: workspace.id,
                ecosystem,
                packageName: dep.packageName,
                currentVersion: cleanedVersion,
                repositoryId: repo.id,
              });

              imported++;
            }

            dependenciesFound = true;
            break; // Stop after finding first valid manifest
          }

          if (!dependenciesFound) {
            skipped++;
          }
        } catch (error) {
          this.logger.error('dependency_watcher_import_failed', { 
            repository: repo.fullName, 
            error: error instanceof Error ? error.message : String(error) 
          });
          skipped++;
        }
      }
    }

    return {
      total,
      imported,
      skipped,
      repositories: workspaceProjects.reduce((acc, p) => acc + p.repositories.length, 0),
    };
  }
}
