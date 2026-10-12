import type { VaultNoteSummary } from '../models/vault-note.models.js';

export function toSearchResultNote(note: VaultNoteSummary, score: number) {
  return {
    id: note.id,
    path: note.path,
    title: note.title,
    type: note.type,
    project: note.project,
    workspace: note.workspace,
    folderId: note.folderId,
    categories: note.categories,
    tags: note.tags,
    date: note.date,
    status: note.status,
    summary: note.summary,
    source: note.source,
    projectSlug: note.project,
    score,
    snippet: note.summary || note.title,
    attachmentCount: note.attachmentCount,
    isPinned: note.isPinned,
  };
}

export type SearchResultNote = ReturnType<typeof toSearchResultNote>;

export function compareSearchResults(
  left: { score: number; date: string | null; path: string },
  right: { score: number; date: string | null; path: string },
): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  const leftTime = new Date(left.date || 0).getTime();
  const rightTime = new Date(right.date || 0).getTime();
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  return left.path.localeCompare(right.path);
}
