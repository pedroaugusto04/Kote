import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { CredentialRecordStatus, IntegrationProvider, MissingCredentialError } from '../../contracts/enums.js';
import { decryptConfig } from '../credentials.js';
import type { RepositoryRecord } from '../models/repository-records.models.js';
import { ContentRepository } from '../ports/notes/content.repository.js';
import { GithubIntegrationGateway, type GithubInstallationRepository } from '../ports/integrations/github-integration.port.js';
import { CredentialRepository } from '../ports/integrations/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';

@Injectable()
export class GithubRepositoryResolutionService {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly credentialRepository: CredentialRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly githubIntegrationGateway: GithubIntegrationGateway,
  ) {}

  async listAccessibleRepositories(input: { userId: string; workspaceSlug: string; missingCredentialError: MissingCredentialError }) {
    const credential = await this.credentialRepository.findCredential(input.userId, input.workspaceSlug, IntegrationProvider.GithubApp);
    if (!credential || credential.status !== CredentialRecordStatus.Connected || credential.revokedAt) {
      if (input.missingCredentialError === 'not_found') throw new NotFoundException('credential_not_found');
      throw new BadRequestException({
        code: 'github_connection_required',
        details: { fieldErrors: { repositoryIds: 'Connect GitHub before linking repositories to the project.' } },
      });
    }

    const environment = this.environmentProvider.read();
    const config = decryptConfig(credential.encryptedConfig, this.environmentProvider) as { installationId?: string };
    const installationId = String(config.installationId || '').trim();
    if (!environment.githubAppId || !environment.githubAppPrivateKey || !installationId) {
      throw new BadRequestException('github_app_installation_not_configured');
    }

    return this.githubIntegrationGateway.fetchInstallationRepositories({
      appId: environment.githubAppId,
      privateKey: environment.githubAppPrivateKey,
      installationId,
    });
  }

  async resolveSelectedRepositories(input: {
    userId: string;
    workspaceSlug: string;
    repositoryIds: string[];
    missingCredentialError?: MissingCredentialError;
  }): Promise<RepositoryRecord[]> {
    if (input.repositoryIds.length === 0) return [];

    const workspaces = await this.contentRepository.listWorkspaces(input.userId);
    const workspace = workspaces[0];
    if (!workspace) throw new NotFoundException('workspace_not_found');

    const availableRepositories = await this.listAccessibleRepositories({
      userId: input.userId,
      workspaceSlug: input.workspaceSlug,
      missingCredentialError: input.missingCredentialError || MissingCredentialError.ConnectionRequired,
    });
    const repositoryById = new Map(availableRepositories.map((repository) => [String(repository.id), repository]));
    const missingRepositoryId = input.repositoryIds.find((repositoryId) => !repositoryById.has(repositoryId));
    if (missingRepositoryId) {
      throw new BadRequestException({
        code: 'invalid_project_repository_selection',
        details: { fieldErrors: { repositoryIds: 'Select only repositories accessible through the linked GitHub account.' } },
      });
    }

    const uniqueRepositoryIds = [...new Set(input.repositoryIds)];
    return Promise.all(uniqueRepositoryIds.map(async (repositoryId) => {
      const repository = repositoryById.get(repositoryId);
      return this.contentRepository.upsertRepository({
        workspaceId: workspace.id,
        externalId: String(repository?.id || repositoryId),
        fullName: repository?.fullName || '',
        htmlUrl: repository?.htmlUrl || null,
        description: repository?.description ?? null,
        defaultBranch: repository?.defaultBranch ?? null,
      });
    }));
  }

  async resolveProjectAndSyncRepoName(input: {
    userId: string;
    workspaceSlug: string;
    repositoryId: string | number;
    repositoryFullName: string;
  }): Promise<string | null> {
    const normalizedRepoId = String(input.repositoryId).trim();
    const normalizedFullName = input.repositoryFullName.trim();
    if (!normalizedRepoId || normalizedRepoId === '0' || !normalizedFullName) return null;

    const projects = await this.contentRepository.listProjects(input.userId);
    const project = projects.find(
      (item) => item.enabled
        && item.workspaceSlug === input.workspaceSlug
        && item.repositories.some((repo) => String(repo.externalId) === normalizedRepoId),
    );

    if (!project) return null;

    const matchedRepo = project.repositories.find((repo) => String(repo.externalId) === normalizedRepoId);
    if (matchedRepo && matchedRepo.fullName.trim().toLowerCase() !== normalizedFullName.toLowerCase()) {
      await this.contentRepository.upsertRepository({
        id: matchedRepo.id,
        workspaceId: matchedRepo.workspaceId,
        externalId: matchedRepo.externalId,
        fullName: normalizedFullName,
        htmlUrl: matchedRepo.htmlUrl,
        description: matchedRepo.description,
        defaultBranch: matchedRepo.defaultBranch,
      });
    }

    return project.projectSlug;
  }

  markSelectedRepositories(availableRepositories: GithubInstallationRepository[], selectedRepositoryFullNames: Set<string>) {
    return availableRepositories.map((repository) => ({
      ...repository,
      id: String(repository.id),
      selected: selectedRepositoryFullNames.has(repository.fullName),
    }));
  }
}
