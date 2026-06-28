import type { QueryInput } from '../../contracts/query.js';
import { StatusFilter, terminalStatuses } from '../../contracts/status-filters.js';
import { SpecialQueryIntent, CanonicalType, KnowledgeStatus } from '../../contracts/enums.js';
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

const SPECIAL_INTENT_PATTERNS = {
  [SpecialQueryIntent.Recent]: {
    phrases: [
      'summarize my recent notes',
      'summarize notes',
      'recent notes',
      'show recent notes',
    ],
    regex: /^(summarize\s+)?(my\s+)?(recent\s+)?notes$/i,
  },
  [SpecialQueryIntent.ActionItems]: {
    phrases: [
      'what are my action items',
      'action items',
      'my action items',
      'show action items',
    ],
    regex: /^(what\s+are\s+)?(my\s+)?action\s+items$/i,
  },
  [SpecialQueryIntent.Decisions]: {
    phrases: [
      'review key decisions made',
      'review key decisions',
      'key decisions',
      'decisions',
    ],
    regex: /^(review\s+)?(key\s+)?decisions(\s+made)?$/i,
  },
};

const ACTION_INDICATOR_TAGS = ['action', 'action-item', CanonicalType.Followup.toLowerCase(), 'todo'];
const ACTION_INDICATOR_CATEGORIES = ['action', CanonicalType.Followup.toLowerCase(), 'todo'];
const ACTION_INDICATOR_TYPES = [CanonicalType.Followup.toLowerCase(), 'reminder', 'task'];

const DECISION_INDICATOR_TAGS = [CanonicalType.Decision.toLowerCase(), 'decisions'];
const DECISION_INDICATOR_CATEGORIES = [CanonicalType.Decision.toLowerCase()];

export function getSpecialQueryIntent(queryText: string): SpecialQueryIntent | null {
  const normalized = queryText.trim().toLowerCase().replace(/[?.,!]/g, '');

  for (const [intent, pattern] of Object.entries(SPECIAL_INTENT_PATTERNS)) {
    if (pattern.phrases.includes(normalized) || pattern.regex.test(normalized)) {
      return intent as SpecialQueryIntent;
    }
  }

  return null;
}

export function matchesIntent(note: VaultNoteSummary, intent: SpecialQueryIntent): boolean {
  if (intent === SpecialQueryIntent.Recent) {
    return true;
  }

  if (intent === SpecialQueryIntent.ActionItems) {
    const status = note.status.toLowerCase();
    const isActionStatus = [
      KnowledgeStatus.Pending.toLowerCase(),
      KnowledgeStatus.Overdue.toLowerCase(),
    ].includes(status);

    const hasActionTag = note.tags.some((tag) =>
      ACTION_INDICATOR_TAGS.includes(tag.toLowerCase())
    );

    const hasActionCategory = note.categories.some((cat) => {
      const name = cat.name.toLowerCase();
      return ACTION_INDICATOR_CATEGORIES.some((indicator) => name.includes(indicator));
    });

    const isActionType = ACTION_INDICATOR_TYPES.includes(note.type.toLowerCase());

    return isActionStatus || hasActionTag || hasActionCategory || isActionType;
  }

  if (intent === SpecialQueryIntent.Decisions) {
    const hasDecisionTag = note.tags.some((tag) =>
      DECISION_INDICATOR_TAGS.includes(tag.toLowerCase())
    );

    const hasDecisionCategory = note.categories.some((cat) => {
      const name = cat.name.toLowerCase();
      return DECISION_INDICATOR_CATEGORIES.some((indicator) => name.includes(indicator));
    });

    const isDecisionType = note.type.toLowerCase() === CanonicalType.Decision.toLowerCase();

    return hasDecisionTag || hasDecisionCategory || isDecisionType;
  }

  return false;
}

export function rankKnowledgeMatches(notes: VaultNoteSummary[], query: Pick<QueryInput, 'query' | 'projectSlug' | 'workspaceSlug' | 'status' | 'limit'>) {
  const intent = getSpecialQueryIntent(query.query);
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
      let score = 0;
      if (intent) {
        score = matchesIntent(note, intent) ? 1 : 0;
      } else {
        score = scoreKnowledgeNote(note, tokens);
      }
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
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      const leftTime = new Date(left.date || 0).getTime();
      const rightTime = new Date(right.date || 0).getTime();
      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }
      return left.path.localeCompare(right.path);
    });
}
