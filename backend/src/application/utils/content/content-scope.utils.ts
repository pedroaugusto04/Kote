import type { SaveProjectInput, SaveWorkspaceInput } from '../../models/repository-records.models.js';
import type { ContentRepository } from '../../ports/notes/content.repository.js';

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

const emptyScope: ResolvedContentScope = {
  projectId: null,
  workspaceId: null,
  project: null,
  workspace: null,
};

/**
 * Resolves project/workspace slugs to UUIDs using the shared ContentRepository lookups.
 * Project slug takes precedence; when present, workspaceId is derived from the project record.
 */
export async function resolveContentScopeFromSlugs(
  contentRepository: ContentRepository,
  userId: string,
  input: ContentScopeSlugs,
): Promise<ResolvedContentScope> {
  const projectSlug = String(input.projectSlug || '').trim();
  if (projectSlug) {
    const project = await contentRepository.getProjectBySlug(userId, projectSlug);
    if (!project) {
      return emptyScope;
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
    const workspace = await contentRepository.getWorkspaceBySlug(userId, workspaceSlug);
    if (!workspace) {
      return emptyScope;
    }

    return {
      projectId: null,
      workspaceId: workspace.id,
      project: null,
      workspace,
    };
  }

  return emptyScope;
}

export async function resolveWorkspaceIdFromSlug(
  contentRepository: ContentRepository,
  userId: string,
  workspaceSlug: string,
): Promise<string | null> {
  const scope = await resolveContentScopeFromSlugs(contentRepository, userId, { workspaceSlug });
  return scope.workspaceId;
}
