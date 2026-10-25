import type { ContentRepository } from '../../ports/notes/content.repository.js';
import type { ResolvedProjectWorkspace } from '../../services/content/workspace-scope-resolver.service.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';

export type { ResolvedProjectWorkspace };

export async function resolveProjectWorkspaceContext(
  contentRepository: ContentRepository,
  userId: string,
  projectId: string,
  workspaceId?: string,
): Promise<ResolvedProjectWorkspace> {
  return new WorkspaceScopeResolver(contentRepository).resolveProjectWorkspace(
    userId,
    projectId,
    workspaceId,
  );
}
