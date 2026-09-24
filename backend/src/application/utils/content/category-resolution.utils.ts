import type { ContentRepository } from '../../ports/notes/content.repository.js';

export async function resolveCategoryIds(
  contentRepository: ContentRepository,
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
  let category = await contentRepository.findCategoryByName(userId, workspaceId, canonicalType, tx);
  if (!category) {
    category = await contentRepository.createCategory(userId, workspaceId, {
      name: canonicalType,
      color: '#9e9e9e',
      icon: '',
    }, tx);
  }
  return [category.id];
}
