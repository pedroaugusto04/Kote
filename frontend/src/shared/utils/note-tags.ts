import type { CategoryRecord } from '../api/models/category';
import { formatDisplayToken } from './format';

export type TagItem = string | { label: string; backgroundColor?: string; color?: string };

type DisplayTagInput = {
  tags: string[];
  categories?: Array<Pick<CategoryRecord, 'name' | 'color'>>;
};

export function buildNoteDisplayTags(input: DisplayTagInput): TagItem[] {
  const categoryTags = (input.categories || []).map((cat) => ({
    label: formatDisplayToken(cat.name),
    backgroundColor: cat.color,
    color: '#ffffff',
  }));
  const customTags = (input.tags || []).map(formatDisplayToken);

  const seen = new Set<string>();
  (input.categories || []).forEach((cat) => seen.add(cat.name.toLowerCase().trim()));

  const filteredCustomTags = customTags.filter((tag) => {
    const key = tag.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return [...categoryTags, ...filteredCustomTags];
}
