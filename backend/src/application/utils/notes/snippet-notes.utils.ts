import type { NoteRecord } from '../../models/repository-records.models.js';
import type { GitCommitContext, SnippetRelevance } from '../../dto/snippet-notes.dto.js';

export const TEMPORAL_WINDOWS_HOURS = {
  DIRECT_MATCH: 12,
  CLOSE_MATCH: 48,
  WEEK_MATCH: 168,
  MONTH_MATCH: 720,
} as const;

export const RELEVANCE_WEIGHTS = {
  TEMPORAL: 0.2,
  CONTENT: 0.8,
} as const;

export const RELEVANCE_REASONS = {
  DIRECT_COMMIT_HASH_MATCH: 'Direct commit hash match',
  SAME_DAY_COMMIT: 'Same day as commit (within 12h)',
  DIRECT_COMMIT_MATCH: 'Direct commit timeframe match (±12h)',
  CLOSE_TO_COMMIT: 'Close to commit date (±2 days)',
  SAME_WEEK_COMMIT: 'Same week as commit',
  SAME_MONTH_COMMIT: 'Same month as commit',
  HIGH_CODE_KEYWORD_MATCH: 'High code keyword similarity',
  MENTIONED_IN_DISCUSSION: 'Mentioned in note discussion',
  FILE_CONTEXT: 'File context discussion',
} as const;

// Common programming language keywords to exclude from identifier extraction (JS/TS, Python, Go, Rust, Java/Kotlin, etc.)
const CODE_KEYWORDS = new Set([
  'import', 'export', 'from', 'const', 'let', 'var', 'function', 'class',
  'return', 'async', 'await', 'if', 'else', 'try', 'catch', 'throw', 'new',
  'this', 'typeof', 'interface', 'type', 'string', 'number', 'boolean',
  'null', 'undefined', 'true', 'false', 'void', 'default', 'case', 'switch',
  'while', 'for', 'of', 'in', 'extends', 'implements', 'private', 'public',
  'protected', 'readonly', 'static', 'promise', 'any', 'unknown', 'never',
  // Python / Ruby
  'def', 'self', 'cls', 'lambda', 'pass', 'yield', 'elif', 'raise', 'except',
  'with', 'module', 'end',
  // Go / Rust
  'fn', 'func', 'struct', 'impl', 'trait', 'mut', 'pub', 'package', 'chan',
  'defer', 'match', 'enum',
  // Java / Kotlin / C# / Scala
  'val', 'fun', 'override', 'sealed', 'record', 'object', 'abstract', 'final',
]);

/**
 * Extracts significant code identifiers/tokens (function names, variables, properties)
 * ignoring language keywords and pure numbers.
 */
export function extractCodeTokens(text?: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(/[a-zA-Z0-9_$]{3,}/g) || [];
  const tokens = new Set<string>();
  for (const match of matches) {
    const lower = match.toLowerCase();
    if (!CODE_KEYWORDS.has(lower) && !/^\d+$/.test(lower)) {
      tokens.add(lower);
    }
  }
  return Array.from(tokens);
}

/**
 * Calculates temporal proximity score between a note and a git commit.
 */
export function calculateTemporalProximity(
  noteDateStr?: string,
  commitDateStr?: string,
): { score: number | null; isOriginMatch: boolean; reason?: string } {
  if (!commitDateStr) {
    return { score: null, isOriginMatch: false };
  }

  const commitTime = new Date(commitDateStr).getTime();
  const noteTime = noteDateStr ? new Date(noteDateStr).getTime() : NaN;

  if (isNaN(commitTime) || isNaN(noteTime)) {
    return { score: null, isOriginMatch: false };
  }

  const diffHours = Math.abs(commitTime - noteTime) / (1000 * 60 * 60);

  if (diffHours <= TEMPORAL_WINDOWS_HOURS.DIRECT_MATCH) {
    return { score: 1.0, isOriginMatch: false, reason: RELEVANCE_REASONS.SAME_DAY_COMMIT };
  }
  if (diffHours <= TEMPORAL_WINDOWS_HOURS.CLOSE_MATCH) {
    return { score: 0.8, isOriginMatch: false, reason: RELEVANCE_REASONS.CLOSE_TO_COMMIT };
  }
  if (diffHours <= TEMPORAL_WINDOWS_HOURS.WEEK_MATCH) {
    return { score: 0.5, isOriginMatch: false, reason: RELEVANCE_REASONS.SAME_WEEK_COMMIT };
  }
  if (diffHours <= TEMPORAL_WINDOWS_HOURS.MONTH_MATCH) {
    return { score: 0.2, isOriginMatch: false, reason: RELEVANCE_REASONS.SAME_MONTH_COMMIT };
  }

  return { score: 0.05, isOriginMatch: false };
}

/**
 * Calculates content token overlap similarity score.
 */
export function calculateContentSimilarity(
  searchableText: string,
  tokens: string[],
): { score: number; reason?: string } {
  if (tokens.length === 0) {
    return { score: 0.5 }; // neutral baseline
  }

  const lowerText = searchableText.toLowerCase();
  let matchCount = 0;

  for (const token of tokens) {
    if (lowerText.includes(token)) {
      matchCount++;
    }
  }

  const matchRatio = matchCount / tokens.length;
  if (matchRatio >= 0.5 || matchCount >= 3) {
    return {
      score: Math.min(1.0, 0.5 + matchRatio * 0.5),
      reason: RELEVANCE_REASONS.HIGH_CODE_KEYWORD_MATCH,
    };
  }
  if (matchCount >= 1) {
    return {
      score: 0.3 + (matchCount * 0.1),
      reason: RELEVANCE_REASONS.MENTIONED_IN_DISCUSSION,
    };
  }

  return { score: 0.1 };
}

/**
 * Combines temporal proximity and snippet tokens into a unified relevance record.
 */
export function computeSnippetRelevance(
  note: NoteRecord,
  queryTokens: string[],
  commitContext?: GitCommitContext,
): SnippetRelevance {
  const targetCommits = new Set([
    commitContext?.commitHash,
    ...(commitContext?.commitHashes || []),
  ].map((hash) => String(hash || '').trim().toLowerCase()).filter((hash) => (
    hash && !hash.startsWith('00000000')
  )));
  const noteCommit = String(
    (note.metadata as Record<string, unknown> | undefined)?.commitHash ||
    (note.metadata as Record<string, unknown> | undefined)?.commit ||
    (note.metadata as Record<string, unknown> | undefined)?.headSha ||
    ''
  ).trim().toLowerCase();

  if (
    targetCommits.size > 0 &&
    noteCommit &&
    Array.from(targetCommits).some((hash) => noteCommit.startsWith(hash) || hash.startsWith(noteCommit))
  ) {
    return {
      category: 'origin',
      score: 1.0,
      contentScore: 1.0,
      temporalScore: 1.0,
      isOriginMatch: true,
      reason: RELEVANCE_REASONS.DIRECT_COMMIT_HASH_MATCH,
    };
  }

  const temporal = calculateTemporalProximity(
    note.occurredAt || note.createdAt,
    commitContext?.commitDate,
  );

  const rawTextMeta = typeof note.metadata?.rawText === 'string' ? note.metadata.rawText : '';
  const searchableText = [
    note.title,
    note.summary,
    note.markdown,
    note.path,
    rawTextMeta,
  ].filter(Boolean).join(' ');

  const content = calculateContentSimilarity(searchableText, queryTokens);

  let finalScore: number;
  if (temporal.score !== null) {
    finalScore = (RELEVANCE_WEIGHTS.TEMPORAL * temporal.score) + (RELEVANCE_WEIGHTS.CONTENT * content.score);
  } else {
    finalScore = content.score;
  }

  const reason = temporal.reason || content.reason || RELEVANCE_REASONS.FILE_CONTEXT;

  return {
    category: 'same-file',
    score: Number(finalScore.toFixed(3)),
    contentScore: content.score,
    temporalScore: temporal.score ?? undefined,
    isOriginMatch: temporal.isOriginMatch,
    reason,
  };
}
