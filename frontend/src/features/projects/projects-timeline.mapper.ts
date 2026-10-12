import { SOURCE_VALUES } from '../../shared/utils/format';
import type { ProjectTimelineItem, ProjectTimelineItemCategory } from '../../shared/api/models/project-timeline';
import type { QueryResponse } from '../../shared/api/models/query';

export function deriveTimelineCategory(source: string | undefined): ProjectTimelineItemCategory {
  if (!source) return SOURCE_VALUES.MANUAL as ProjectTimelineItemCategory;
  const s = source.toLowerCase();
  if (s.includes(SOURCE_VALUES.GITHUB)) return SOURCE_VALUES.GITHUB as ProjectTimelineItemCategory;
  if (s.includes(SOURCE_VALUES.WHATSAPP) || s.includes('evolution')) return SOURCE_VALUES.WHATSAPP as ProjectTimelineItemCategory;
  if (
    s === SOURCE_VALUES.AI_CHAT ||
    s.includes('antigravity') ||
    s.includes('codex') ||
    s.includes('claude') ||
    s.includes('opencode') ||
    s.includes('open-code')
  ) {
    return SOURCE_VALUES.AI_CHAT as ProjectTimelineItemCategory;
  }
  return SOURCE_VALUES.MANUAL as ProjectTimelineItemCategory;
}

export function toProjectTimelineItemFromSearchMatch(
  match: QueryResponse['matches'][number],
): ProjectTimelineItem {
  return {
    id: match.id,
    noteId: match.id,
    title: match.title,
    summary: match.summary,
    project: match.project,
    workspace: match.workspace,
    folderId: match.folderId,
    categories: match.categories,
    type: match.type,
    category: deriveTimelineCategory(match.source),
    status: match.status,
    source: match.source,
    sourceChannel: match.source,
    date: match.date,
    tags: match.tags,
    path: match.path,
    attachmentCount: match.attachmentCount || 0,
    isPinned: match.isPinned,
  };
}

export function mapSearchResultsToTimeline(
  matches: QueryResponse['matches'] | undefined,
): ProjectTimelineItem[] {
  if (!matches) return [];
  return matches.map(toProjectTimelineItemFromSearchMatch);
}
