import { Injectable } from '@nestjs/common';
import type { UpdateProjectInput } from '../../models/project-input.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';
import { GithubRepositoryResolutionService } from '../../services/integrations/github-repository-resolution.service.js';
import { toProjectUpdateInput } from '../../mappers/project-update.mapper.js';

@Injectable()
export class UpdateProjectUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly githubRepositoryResolution: GithubRepositoryResolutionService,
    private readonly scopeResolver: WorkspaceScopeResolver,
  ) { }

  async execute(input: UpdateProjectInput, userId: string) {
    const project = await this.scopeResolver.resolveProject(userId, input.projectId);

    const selectedRepositories = await this.githubRepositoryResolution.resolveSelectedRepositories({
      userId,
      workspaceSlug: project.workspaceSlug || '',
      repositoryIds: input.repositoryIds,
    });

    const updateData = toProjectUpdateInput(input, project);
    const updatedProject = await this.contentRepository.upsertProject(userId, {
      ...project,
      ...updateData,
      repositories: selectedRepositories,
    });

    return { ok: true as const, project: updatedProject };
  }
}
