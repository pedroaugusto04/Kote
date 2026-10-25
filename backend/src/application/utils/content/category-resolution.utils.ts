import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';
import type { ContentRepository } from '../../ports/notes/content.repository.js';

export async function resolveCategoryIds(
  contentRepository: ContentRepository,
  userId: string,
  workspaceId: string,
  canonicalType: string | undefined,
  providedCategoryIds?: string[],
  tx?: any,
): Promise<string[]> {
  return new WorkspaceScopeResolver(contentRepository).resolveOrCreateCategoryIds(
    userId,
    workspaceId,
    canonicalType,
    providedCategoryIds,
    tx,
  );
}
