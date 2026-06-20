import type { QueryInput } from '../../contracts/query.js';
import { StatusFilter, terminalStatuses } from '../../contracts/status-filters.js';
import type { VaultNoteSummary } from '../models/vault-note.models.js';

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function scoreKnowledgeNote(note: VaultNoteSummary, tokens: string[]): number {
  const haystack = [note.title, note.path, note.summary, note.tags.join(' ')].join('\n').toLowerCase();
  return tokens.reduce((total, token) => total + (haystack.includes(token) ? 5 : 0), 0);
}

export function rankKnowledgeMatches(notes: VaultNoteSummary[], query: Pick<QueryInput, 'query' | 'projectSlug' | 'workspaceSlug' | 'status' | 'limit'>) {
  const tokens = tokenizeQuery(query.query);
  return notes
    .filter((note) =>
      (!query.projectSlug || note.project === query.projectSlug)
      && (!query.workspaceSlug || note.workspace === query.workspaceSlug)
      && (
        !('status' in query) || !query.status || (
          query.status === StatusFilter.Open
            ? !terminalStatuses.includes(note.status.toLowerCase() as (typeof terminalStatuses)[number])
            : note.status.toLowerCase() === query.status
        )
      ),
    )
    .map((note) => {
      const score = scoreKnowledgeNote(note, tokens);
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
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
}
