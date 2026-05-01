import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { CreateProjectInput, UpdateProjectInput } from '../../models/project-input.models.js';
import { ContentRepository } from '../../ports/content.repository.js';

function sameRepo(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

@Injectable()
export class CreateProjectUseCase {
  constructor(private readonly contentRepository: ContentRepository) { }

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

    const workspaceRepositories = await this.contentRepository.listRepositories(userId, workspace.workspaceSlug);
    const selectedRepositories = workspaceRepositories.filter(r => input.repositoryIds.includes(r.id));

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

@Injectable()
export class UpdateProjectUseCase {
  constructor(private readonly contentRepository: ContentRepository) { }

  async execute(input: UpdateProjectInput, userId: string) {

    const project = await this.contentRepository.getProjectBySlug(userId, input.projectSlug);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const workspaceRepositories = await this.contentRepository.listRepositories(userId, project.workspaceSlug);
    const selectedRepositories = workspaceRepositories.filter(r => input.repositoryIds.includes(r.id));

    const updatedProject = await this.contentRepository.upsertProject(userId, {
      ...project,
      displayName: input.displayName,
      repositories: selectedRepositories,
      aliases: input.aliases,
      defaultTags: input.defaultTags,
    });

    return { ok: true as const, project: updatedProject };
  }
}

@Injectable()
export class DeleteProjectUseCase {
  constructor(private readonly contentRepository: ContentRepository) { }

  async execute(projectSlug: string, userId: string) {

    const project = await this.contentRepository.getProjectBySlug(userId, projectSlug);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const notes = await this.contentRepository.listNotes(userId);
    if (notes.some((note) => note.projectSlug === projectSlug)) {
      throw new BadRequestException('project_has_notes');
    }

    await this.contentRepository.deleteProject(userId, projectSlug);

    const workspace = (await this.contentRepository.listWorkspaces(userId)).find((item) => item.workspaceSlug === project.workspaceSlug);

    return { ok: true as const, projectSlug, workspace };
  }
}
