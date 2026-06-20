import type { CategoryRecord } from '../api/models/category';
import type { NoteStatus } from '../api/models/note-status';
import { formatDisplayToken, formatSourceLabel } from './format';

type DisplayTagInput = {
  tags: string[];
  status: NoteStatus | string;
  source?: string | null;
  sourceChannel?: string | null;
  categories?: Array<Pick<CategoryRecord, 'name'>>;
};

export function buildNoteDisplayTags(input: DisplayTagInput): string[] {
  const source = formatSourceLabel(input.source || input.sourceChannel || '');
  const values = [
    ...input.tags.map(formatDisplayToken),
    formatDisplayToken(input.status),
    source,
    ...(input.categories || []).map((category) => formatDisplayToken(category.name)),
  ];

  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
