import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import type { WorkspaceScope } from '../../models/workspace-scope.models.js';

export type ResolveScopeInput = {
  workspaceSlug?: string | null;
  projectSlug?: string | null;
  allowAllProjects?: boolean;
};

export const SCOPE_ERROR_MESSAGES = {
  WORKSPACE_SLUG_MISSING: 'workspace_slug_missing',
  WORKSPACE_NOT_FOUND: 'workspace_not_found',
  PROJECT_SLUG_MISSING: 'project_slug_missing',
  PROJECT_NOT_FOUND: 'project_not_found',
} as const;

export const SCOPE_SPECIAL_PROJECT = {
  ALL: 'all',
} as const;

@Injectable()
export class WorkspaceScopeResolver {
  constructor(private readonly contentRepository: ContentRepository) {}

  async resolve(userId: string, input: ResolveScopeInput): Promise<WorkspaceScope> {
    const rawProject = input.projectSlug?.trim();
    const rawWorkspace = input.workspaceSlug?.trim();

    // 1. If projectSlug is provided
    if (rawProject) {
      if (rawProject === SCOPE_SPECIAL_PROJECT.ALL) {
        if (!input.allowAllProjects) {
          throw new NotFoundException(SCOPE_ERROR_MESSAGES.PROJECT_NOT_FOUND);
        }

        let resolvedWorkspaceId = '';
        let resolvedWorkspaceSlug = rawWorkspace || '';

        if (rawWorkspace) {
          const workspace = await this.contentRepository.getWorkspaceBySlug(userId, rawWorkspace);
          if (!workspace) {
            throw new NotFoundException(SCOPE_ERROR_MESSAGES.WORKSPACE_NOT_FOUND);
          }
          resolvedWorkspaceId = workspace.id;
          resolvedWorkspaceSlug = workspace.workspaceSlug;
        }

        return {
          userId,
          workspaceId: resolvedWorkspaceId,
          workspaceSlug: resolvedWorkspaceSlug,
          projectId: SCOPE_SPECIAL_PROJECT.ALL,
          projectSlug: SCOPE_SPECIAL_PROJECT.ALL,
        };
      }

      let resolvedWorkspaceId = '';
      let resolvedWorkspaceSlug = '';

      if (rawWorkspace) {
        const workspace = await this.contentRepository.getWorkspaceBySlug(userId, rawWorkspace);
        if (!workspace) {
          throw new NotFoundException(SCOPE_ERROR_MESSAGES.WORKSPACE_NOT_FOUND);
        }
        resolvedWorkspaceId = workspace.id;
        resolvedWorkspaceSlug = workspace.workspaceSlug;
      }

      const project = await this.contentRepository.getProjectBySlug(userId, rawProject, resolvedWorkspaceId || undefined);
      if (!project || !project.enabled) {
        throw new NotFoundException(SCOPE_ERROR_MESSAGES.PROJECT_NOT_FOUND);
      }

      if (resolvedWorkspaceId && project.workspaceId && project.workspaceId !== resolvedWorkspaceId) {
        throw new NotFoundException(SCOPE_ERROR_MESSAGES.PROJECT_NOT_FOUND);
      }

      const workspaceSlug = project.workspaceSlug || resolvedWorkspaceSlug || rawWorkspace || '';
      return {
        userId,
        workspaceId: project.workspaceId || resolvedWorkspaceId || '',
        workspaceSlug,
        projectId: project.id,
        projectSlug: project.projectSlug,
      };
    }

    // 2. Project is not provided, workspaceSlug is required
    if (!rawWorkspace) {
      throw new NotFoundException(SCOPE_ERROR_MESSAGES.WORKSPACE_SLUG_MISSING);
    }

    const workspace = await this.contentRepository.getWorkspaceBySlug(userId, rawWorkspace);
    if (!workspace) {
      throw new NotFoundException(SCOPE_ERROR_MESSAGES.WORKSPACE_NOT_FOUND);
    }

    return {
      userId,
      workspaceId: workspace.id,
      workspaceSlug: workspace.workspaceSlug,
      projectId: null,
      projectSlug: null,
    };
  }
}
