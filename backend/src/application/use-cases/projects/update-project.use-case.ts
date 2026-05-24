import { Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateProjectInput } from '../../models/project-input.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { GithubRepositoryResolutionService } from '../../services/github-repository-resolution.service.js';

@Injectable()
export class UpdateProjectUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly githubRepositoryResolution: GithubRepositoryResolutionService,
  ) { }

  async execute(input: UpdateProjectInput, userId: string) {

    const project = await this.contentRepository.getProjectBySlug(userId, input.projectSlug);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const selectedRepositories = await this.githubRepositoryResolution.resolveSelectedRepositories({
      userId,
      workspaceSlug: project.workspaceSlug,
      repositoryIds: input.repositoryIds,
    });

    const updatedProject = await this.contentRepository.upsertProject(userId, {
      ...project,
      displayName: input.displayName,
      repositories: selectedRepositories,
      defaultTags: input.defaultTags,
    });

    return { ok: true as const, project: updatedProject };
  }
}
