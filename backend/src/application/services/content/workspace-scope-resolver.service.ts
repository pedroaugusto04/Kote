import crypto from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Project } from '../../../domain/projects.js';
import type { IngestPayload } from '../../../contracts/ingest.js';
import { toProjectFromIngest, toProjectFromRecord, toProjectSaveInput } from '../../mappers/ingest.mapper.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import type { WorkspaceScope } from '../../models/workspace-scope.models.js';
import type { ProjectRecord, SaveWorkspaceInput, SaveProjectInput } from '../../models/repository-records.models.js';
import { collectFolderDescendantIds } from '../../utils/content/project-folder.utils.js';
import type { ResolvedProjectBriefScope } from '../../models/project-brief.models.js';

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

export interface ResolvedProjectWorkspace {
  project: ProjectRecord;
  workspaceId: string;
  workspaceSlug: string;
}

export interface ResolvedIngestProject {
  project: Project;
  projectId: string;
}

export type ContentScopeSlugs = {
  projectSlug?: string;
  workspaceSlug?: string;
};

export type ResolvedContentScope = {
  projectId: string | null;
  workspaceId: string | null;
  project: SaveProjectInput | null;
  workspace: SaveWorkspaceInput | null;
};

const emptyContentScope: ResolvedContentScope = {
  projectId: null,
  workspaceId: null,
  project: null,
  workspace: null,
};

@Injectable()
export class WorkspaceScopeResolver {
  constructor(private readonly contentRepository: ContentRepository) {}

  async resolveOrCreateProjectForIngest(
    userId: string,
    workspaceId: string,
    workspaceSlug: string,
    parsed: IngestPayload,
    tx?: any,
  ): Promise<ResolvedIngestProject> {
    const existingProject = await this.contentRepository.getProjectBySlug(userId, parsed.event.projectSlug);
    const isMatchingProject = existingProject && existingProject.enabled && existingProject.workspaceId === workspaceId;
    const projectId = isMatchingProject ? existingProject.id : crypto.randomUUID();

    const project: Project = isMatchingProject
      ? toProjectFromRecord(existingProject, workspaceSlug)
      : toProjectFromIngest(parsed, workspaceSlug);

    if (!isMatchingProject) {
      if (project.repositories.length) {
        const repo = project.repositories[0]!;
        const savedRepo = await this.contentRepository.upsertRepository({
          workspaceId,
          externalId: repo.externalId,
          fullName: repo.fullName,
          htmlUrl: repo.htmlUrl,
          description: repo.description,
          defaultBranch: repo.defaultBranch,
        }, tx);
        project.repositories[0] = {
          ...savedRepo,
          workspaceSlug,
        };
      }
      const projectSaveInput = toProjectSaveInput(project, workspaceId, projectId);
      await this.contentRepository.upsertProject(userId, projectSaveInput);
    }

    return { project, projectId };
  }

  async resolveProject(userId: string, projectId: string): Promise<ProjectRecord> {
    const project = await this.contentRepository.getProjectById(userId, projectId);
    if (!project || (project.enabled !== undefined && !project.enabled)) {
      throw new NotFoundException(SCOPE_ERROR_MESSAGES.PROJECT_NOT_FOUND);
    }
    return project;
  }

  async resolveContentScopeFromSlugs(
    userId: string,
    input: ContentScopeSlugs,
  ): Promise<ResolvedContentScope> {
    const projectSlug = String(input.projectSlug || '').trim();
    if (projectSlug) {
      const project = await this.contentRepository.getProjectBySlug(userId, projectSlug);
      if (!project) {
        return emptyContentScope;
      }

      return {
        projectId: project.id,
        workspaceId: project.workspaceId ?? null,
        project,
        workspace: null,
      };
    }

    const workspaceSlug = String(input.workspaceSlug || '').trim();
    if (workspaceSlug) {
      const workspace = await this.findWorkspace(userId, workspaceSlug);
      if (!workspace) {
        return emptyContentScope;
      }

      return {
        projectId: null,
        workspaceId: workspace.id,
        project: null,
        workspace,
      };
    }

    return emptyContentScope;
  }

  async resolveOrCreateCategoryIds(
    userId: string,
    workspaceId: string,
    canonicalType: string | undefined,
    providedCategoryIds?: string[],
    tx?: any,
  ): Promise<string[]> {
    if (providedCategoryIds !== undefined) {
      return providedCategoryIds;
    }
    if (!canonicalType) {
      return [];
    }
    let category = await this.contentRepository.findCategoryByName(userId, workspaceId, canonicalType, tx);
    if (!category) {
      category = await this.contentRepository.createCategory(userId, workspaceId, {
        name: canonicalType,
        color: '#9e9e9e',
        icon: '',
      }, tx);
    }
    return [category.id];
  }

  async resolveFolderDescendantIds(
    userId: string,
    projectId: string,
    folderId?: string,
  ): Promise<string[] | undefined> {
    const normalizedFolderId = folderId?.trim();
    if (!projectId || !normalizedFolderId) {
      return undefined;
    }

    const folders = await this.contentRepository.listProjectFolders(userId, projectId);
    const selectedFolder = folders.find((folder) => folder.id === normalizedFolderId);
    if (!selectedFolder) {
      throw new NotFoundException('folder_not_found');
    }

    return collectFolderDescendantIds(folders, normalizedFolderId);
  }

  async resolveWorkspace(userId: string, workspaceSlug?: string | null): Promise<SaveWorkspaceInput> {
    const slug = workspaceSlug?.trim();
    if (!slug) {
      throw new NotFoundException(SCOPE_ERROR_MESSAGES.WORKSPACE_SLUG_MISSING);
    }
    const workspace = await this.contentRepository.getWorkspaceBySlug(userId, slug);
    if (!workspace) {
      throw new NotFoundException(SCOPE_ERROR_MESSAGES.WORKSPACE_NOT_FOUND);
    }
    return workspace;
  }

  async resolveWorkspaceId(userId: string, workspaceSlug?: string | null): Promise<string> {
    const workspace = await this.resolveWorkspace(userId, workspaceSlug);
    return workspace.id;
  }

  async findWorkspace(userId: string, workspaceSlug?: string | null): Promise<SaveWorkspaceInput | null> {
    const slug = workspaceSlug?.trim();
    if (!slug) return null;
    return this.contentRepository.getWorkspaceBySlug(userId, slug);
  }

  async findWorkspaceId(userId: string, workspaceSlug?: string | null): Promise<string | null> {
    const workspace = await this.findWorkspace(userId, workspaceSlug);
    return workspace?.id ?? null;
  }

  async resolveProjectWorkspace(
    userId: string,
    projectId: string,
    workspaceId?: string,
  ): Promise<ResolvedProjectWorkspace> {
    const project = await this.resolveProject(userId, projectId);

    const workspaceSlug = project.workspaceSlug ?? '';
    const resolvedWorkspaceId = workspaceId
      || project.workspaceId
      || (workspaceSlug ? (await this.contentRepository.getWorkspaceBySlug(userId, workspaceSlug))?.id : undefined);
    if (!resolvedWorkspaceId) {
      throw new NotFoundException(SCOPE_ERROR_MESSAGES.WORKSPACE_NOT_FOUND);
    }

    return {
      project,
      workspaceId: resolvedWorkspaceId,
      workspaceSlug,
    };
  }

  async resolveProjectBriefScope(
    userId: string,
    projectId: string,
    workspaceIdInput?: string,
  ): Promise<ResolvedProjectBriefScope> {
    if (projectId === 'all') {
      const workspace = await this.resolveTargetWorkspace(userId, workspaceIdInput);
      return {
        isAll: true,
        projectSlug: 'all',
        workspaceId: workspace.id,
        workspaceSlug: workspace.workspaceSlug,
      };
    }

    const project = await this.contentRepository.getProjectById(userId, projectId);
    if (!project || !project.enabled) {
      throw new NotFoundException(SCOPE_ERROR_MESSAGES.PROJECT_NOT_FOUND);
    }

    return {
      isAll: false,
      projectSlug: project.projectSlug,
      workspaceId: project.workspaceId || '',
      workspaceSlug: project.workspaceSlug || '',
    };
  }

  private async resolveTargetWorkspace(userId: string, workspaceIdInput?: string) {
    const workspaces = await this.contentRepository.listWorkspaces(userId);
    if (workspaces.length === 0) {
      throw new NotFoundException(SCOPE_ERROR_MESSAGES.WORKSPACE_NOT_FOUND);
    }

    if (workspaceIdInput) {
      const match = workspaces.find((w) => w.id === workspaceIdInput);
      if (!match) {
        throw new NotFoundException(SCOPE_ERROR_MESSAGES.WORKSPACE_NOT_FOUND);
      }
      return match;
    }

    return workspaces[0];
  }

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
          const workspace = await this.resolveWorkspace(userId, rawWorkspace);
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
        const workspace = await this.resolveWorkspace(userId, rawWorkspace);
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
    const workspace = await this.resolveWorkspace(userId, rawWorkspace);

    return {
      userId,
      workspaceId: workspace.id,
      workspaceSlug: workspace.workspaceSlug,
      projectId: null,
      projectSlug: null,
    };
  }
}
