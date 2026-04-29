import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { CreateProjectInput, UpdateProjectInput } from '../../models/project-input.models.js';
import { ContentRepository } from '../../ports/content.repository.js';

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

@Injectable()
export class UpdateProjectUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(input: UpdateProjectInput, userId: string) {
    if (input.projectSlug === 'inbox') throw new BadRequestException('project_immutable');

    const project = await this.contentRepository.getProjectBySlug(userId, input.projectSlug);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const projects = await this.contentRepository.listProjects(userId);
    if (
      input.repoFullName &&
      projects.some((item) => item.projectSlug !== input.projectSlug && item.enabled && item.workspaceSlug === project.workspaceSlug && item.repoFullName && sameRepo(item.repoFullName, input.repoFullName))
    ) {
      throw new ConflictException({
        code: 'project_repo_already_mapped',
        details: { fieldErrors: { repoFullName: 'Este repositorio ja esta vinculado a outro projeto.' } },
      });
    }

    const updatedProject = await this.contentRepository.upsertProject(userId, {
      ...project,
      displayName: input.displayName,
      repoFullName: input.repoFullName,
      aliases: input.aliases,
      defaultTags: input.defaultTags,
    });

    return { ok: true as const, project: updatedProject };
  }
}

@Injectable()
export class DeleteProjectUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(projectSlug: string, userId: string) {
    if (projectSlug === 'inbox') throw new BadRequestException('project_immutable');

    const project = await this.contentRepository.getProjectBySlug(userId, projectSlug);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const notes = await this.contentRepository.listNotes(userId);
    if (notes.some((note) => note.projectSlug === projectSlug)) {
      throw new BadRequestException('project_has_notes');
    }

    await this.contentRepository.deleteProject(userId, projectSlug);

    const workspace = (await this.contentRepository.listWorkspaces(userId)).find((item) => item.workspaceSlug === project.workspaceSlug);
    const updatedWorkspace = workspace
      ? await this.contentRepository.upsertWorkspace(userId, {
          ...workspace,
          projectSlugs: workspace.projectSlugs.filter((slug) => slug !== projectSlug),
        })
      : null;

    return { ok: true as const, projectSlug, workspace: updatedWorkspace };
  }
}
