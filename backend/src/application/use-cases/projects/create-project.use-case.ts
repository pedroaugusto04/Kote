import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { ContentRepository } from '../../ports/content.repository.js';

export type CreateProjectInput = {
  displayName: string;
  projectSlug: string;
  repoFullName: string;
  aliases: string[];
  defaultTags: string[];
};

function sameRepo(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

@Injectable()
export class CreateProjectUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

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
    if (
      input.repoFullName &&
      projects.some((project) => project.enabled && project.workspaceSlug === workspace.workspaceSlug && project.repoFullName && sameRepo(project.repoFullName, input.repoFullName))
    ) {
      throw new ConflictException({
        code: 'project_repo_already_mapped',
        details: { fieldErrors: { repoFullName: 'Este repositorio ja esta vinculado a outro projeto.' } },
      });
    }

    const project = await this.contentRepository.upsertProject(userId, {
      projectSlug: input.projectSlug,
      displayName: input.displayName,
      repoFullName: input.repoFullName,
      workspaceSlug: workspace.workspaceSlug,
      aliases: input.aliases,
      defaultTags: input.defaultTags,
      enabled: true,
    });

    const projectSlugs = [...new Set([...workspace.projectSlugs, project.projectSlug])];
    const updatedWorkspace = await this.contentRepository.upsertWorkspace(userId, {
      ...workspace,
      projectSlugs,
    });

    return {
      ok: true as const,
      project,
      workspace: updatedWorkspace,
    };
  }
}
