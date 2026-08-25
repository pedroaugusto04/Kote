import type { NoteRecord } from '../../models/repository-records.models.js';
import type { SnippetRelevance } from '../../dto/snippet-notes.dto.js';
import type { CodeLineageCategory } from '../../models/code-lineage.models.js';

export const CODE_LINEAGE_RELEVANCE_THRESHOLDS = {
  sameFileContent: 0.40,
  semanticSimilarity: 0.48,
} as const;

const GIT_SOURCE_MARKERS = ['github', 'git', 'commit'] as const;

export function isGitLineageNote(note: Pick<NoteRecord, 'sourceChannel' | 'source'>): boolean {
  const source = `${note.sourceChannel || ''} ${note.source || ''}`.toLowerCase();
  return GIT_SOURCE_MARKERS.some((marker) => source.includes(marker));
}

export function classifyDirectLineageMatch(
  note: Pick<NoteRecord, 'sourceChannel' | 'source'>,
  relevance: SnippetRelevance,
): Exclude<CodeLineageCategory, 'cross-file-related'> | null {
  if (relevance.isOriginMatch) return 'origin';
  const hasContentRelevance = relevance.contentScore >= CODE_LINEAGE_RELEVANCE_THRESHOLDS.sameFileContent;
  const hasCloseTemporalRelevance = (relevance.temporalScore ?? 0) >= 0.8 && relevance.contentScore >= 0.2;
  if (isGitLineageNote(note) && (hasContentRelevance || hasCloseTemporalRelevance)) {
    return 'linked-commit';
  }
  if (hasContentRelevance) return 'same-file';
  return null;
}
