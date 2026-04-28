import type { QueryInput } from '../../contracts/query.js';
import type { VaultNoteSummary } from '../models/vault-note.models.js';

export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

export function scoreKnowledgeNote(note: VaultNoteSummary, tokens: string[]): number {
  const haystack = [note.title, note.path, note.summary, note.tags.join(' ')].join('\n').toLowerCase();
  return tokens.reduce((total, token) => total + (haystack.includes(token) ? 5 : 0), 0);
}

export function rankKnowledgeMatches(notes: VaultNoteSummary[], query: Pick<QueryInput, 'query' | 'projectSlug' | 'workspaceSlug' | 'limit'>) {
  const tokens = tokenizeQuery(query.query);
  return notes
    .filter((note) => (!query.projectSlug || note.project === query.projectSlug) && (!query.workspaceSlug || note.workspace === query.workspaceSlug))
    .map((note) => {
      const score = scoreKnowledgeNote(note, tokens);
      return {
        path: note.path,
        title: note.title,
        projectSlug: note.project,
        score,
        snippet: note.summary || note.title,
      };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, query.limit);
}
