import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { CreateProjectInput } from '../../models/project-input.models.js';
import { ContentRepository } from '../../ports/content.repository.js';
import { GithubRepositoryResolutionService } from '../../services/github-repository-resolution.service.js';

@Injectable()
export class CreateProjectUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly githubRepositoryResolution: GithubRepositoryResolutionService,
  ) { }

  async execute(input: CreateProjectInput, userId: string) {
    const workspaces = await this.contentRepository.listWorkspaces(userId);
    const workspace = workspaces[0];
    if (!workspace) throw new NotFoundException('workspace_not_found');

    const projects = await this.contentRepository.listProjects(userId);
    if (projects.some((project) => project.enabled && project.projectSlug === input.projectSlug)) {
      throw new ConflictException({
        code: 'project_slug_already_exists',
        details: { fieldErrors: { projectSlug: 'Este slug de projeto ja existe.' } },
      });
    }

    const selectedRepositories = await this.githubRepositoryResolution.resolveSelectedRepositories({
      userId,
      workspaceSlug: workspace.workspaceSlug,
      repositoryIds: input.repositoryIds,
    });

    const project = await this.contentRepository.upsertProject(userId, {
      projectSlug: input.projectSlug,
      displayName: input.displayName,
      workspaceSlug: workspace.workspaceSlug,
      repositories: selectedRepositories,
      aliases: input.aliases,
      defaultTags: input.defaultTags,
      enabled: true,
    });

    return {
      ok: true as const,
      project,
      workspace,
    };
  }
}
