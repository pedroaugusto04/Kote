import type { NoteRecord } from '../../models/repository-records.models.js';
import type { GitCommitContext, SnippetRelevance } from '../../dto/snippet-notes.dto.js';

export const RELEVANCE_REASONS = {
  DIRECT_COMMIT_HASH_MATCH: 'Direct commit hash match',
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

function extractNoteCommitShas(note: NoteRecord): string[] {
  const shas = new Set<string>();
  const meta = (note.metadata || {}) as Record<string, unknown>;

  for (const field of [meta.commitHash, meta.commit, meta.headSha]) {
    const val = String(field || '').trim().toLowerCase();
    if (val && !val.startsWith('00000000')) shas.add(val);
  }

  const gitActivity = meta.gitActivity as Record<string, unknown> | undefined;
  if (Array.isArray(gitActivity?.createdCommitShas)) {
    for (const sha of gitActivity.createdCommitShas) {
      const val = String(sha || '').trim().toLowerCase();
      if (val && !val.startsWith('00000000')) shas.add(val);
    }
  }

  if (Array.isArray(note.linkedCommits)) {
    for (const commit of note.linkedCommits) {
      const val = String(commit?.commitSha || '').trim().toLowerCase();
      if (val && !val.startsWith('00000000')) shas.add(val);
    }
  }

  return Array.from(shas);
}

/**
 * Computes deterministic commit origin match and snippet token overlap relevance.
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

  const noteCommits = extractNoteCommitShas(note);

  if (
    targetCommits.size > 0 &&
    noteCommits.length > 0 &&
    Array.from(targetCommits).some((target) => (
      noteCommits.some((noteCommit) => noteCommit.startsWith(target) || target.startsWith(noteCommit))
    ))
  ) {
    return {
      category: 'origin',
      score: 1.0,
      contentScore: 1.0,
      isOriginMatch: true,
      reason: RELEVANCE_REASONS.DIRECT_COMMIT_HASH_MATCH,
    };
  }

  const rawTextMeta = typeof note.metadata?.rawText === 'string' ? note.metadata.rawText : '';
  const searchableText = [
    note.title,
    note.summary,
    note.markdown,
    note.path,
    rawTextMeta,
  ].filter(Boolean).join(' ');

  const content = calculateContentSimilarity(searchableText, queryTokens);
  const reason = content.reason || RELEVANCE_REASONS.FILE_CONTEXT;

  return {
    category: 'same-file',
    score: Number(content.score.toFixed(3)),
    contentScore: content.score,
    isOriginMatch: false,
    reason,
  };
}
