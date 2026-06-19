import { CanonicalType } from '../contracts/enums.js';
import type { CategoryRecord } from '../application/models/repository-records.models.js';

export const canonicalTypePriority = [
  CanonicalType.Incident,
  CanonicalType.Decision,
  CanonicalType.Followup,
  CanonicalType.Knowledge,
  CanonicalType.Event,
] as const;

export function resolveCanonicalTypeFromCategories(
  categories: Array<Pick<CategoryRecord, 'id' | 'name'>>,
  categoryIds: string[] = [],
): CanonicalType {
  const selectedCategoryIds = new Set(categoryIds.map((categoryId) => categoryId.trim()).filter(Boolean));
  if (selectedCategoryIds.size === 0) {
    return CanonicalType.Event;
  }

  const selectedCategoryNames = new Set(
    categories
      .filter((category) => selectedCategoryIds.has(category.id))
      .map((category) => category.name.trim().toLowerCase())
      .filter(Boolean),
  );

  for (const canonicalType of canonicalTypePriority) {
    if (selectedCategoryNames.has(canonicalType)) {
      return canonicalType;
    }
  }

  return CanonicalType.Event;
}
