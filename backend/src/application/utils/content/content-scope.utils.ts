import type { SaveProjectInput, SaveWorkspaceInput } from '../../models/repository-records.models.js';
import type { ContentRepository } from '../../ports/notes/content.repository.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';

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
  return new WorkspaceScopeResolver(contentRepository).resolveContentScopeFromSlugs(userId, input);
}

export async function resolveWorkspaceIdFromSlug(
  contentRepository: ContentRepository,
  userId: string,
  workspaceSlug: string,
): Promise<string | null> {
  return new WorkspaceScopeResolver(contentRepository).findWorkspaceId(userId, workspaceSlug);
}
