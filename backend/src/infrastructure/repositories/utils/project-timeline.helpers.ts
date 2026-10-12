import type { ListProjectTimelineInput, ProjectTimelineFilterCategory } from '../../../application/models/project-timeline.models.js';
import type { NoteRecord } from '../../../application/models/repository-records.models.js';
import { EventType, SourceChannel, TimelineCategory } from '../../../contracts/enums.js';
import { noteSummary } from '../../../application/mappers/vault-note.mapper.js';

export const RAW_CATEGORIES_JSON_AGG_SQL = `coalesce(
  json_agg(
    json_build_object(
      'id', cat.id,
      'user_id', cat.user_id,
      'workspace_id', cat.workspace_id,
      'name', cat.name,
      'color', cat.color,
      'color_dark', cat.color_dark,
      'icon', cat.icon,
      'is_system', cat.is_system,
      'created_at', cat.created_at,
      'updated_at', cat.updated_at
    )
  ) filter (where cat.id is not null),
  '[]'::json
) as categories`;

export function projectTimelineItem(record: NoteRecord) {
  const summary = noteSummary(record);
  return {
    ...summary,
    noteId: record.id,
    category: projectTimelineCategory(record),
    sourceChannel: record.sourceChannel,
  };
}

export function projectTimelineCategory(
  record: Pick<NoteRecord, 'metadata' | 'source' | 'sourceChannel' | 'reminderAt'>,
): ProjectTimelineFilterCategory {
  if (hasTimelineReminder(record)) return TimelineCategory.Reminder;
  if (record.sourceChannel === SourceChannel.Github || record.sourceChannel === 'github-push') return TimelineCategory.Github;
  if (record.sourceChannel === SourceChannel.Whatsapp) return TimelineCategory.Whatsapp;
  if (record.sourceChannel === SourceChannel.AiChat) return TimelineCategory.AiChat;
  if (record.sourceChannel === SourceChannel.DependencyWatcher) return TimelineCategory.DependencyWatcher;
  if (record.sourceChannel === SourceChannel.Cli) return TimelineCategory.Manual;
  if (record.sourceChannel === SourceChannel.Ide) return TimelineCategory.Manual;
  return TimelineCategory.Manual;
}

export function hasTimelineReminder(record: Pick<NoteRecord, 'reminderAt'>) {
  return Boolean(record.reminderAt);
}

export function appendTimelineFolderClause(
  clauses: string[],
  values: unknown[],
  folderId: ListProjectTimelineInput['folderId'],
  folderIds: ListProjectTimelineInput['folderIds'],
) {
  if (folderIds && folderIds.length > 0) {
    const placeholders = folderIds.map((id) => {
      values.push(id);
      return `$${values.length}`;
    });
    clauses.push(`n.folder_id in (${placeholders.join(', ')})`);
    return;
  }
  if (folderId === undefined) return;
  const normalizedFolderId = folderId.trim();
  if (!normalizedFolderId) return;
  values.push(normalizedFolderId);
  clauses.push(`n.folder_id = $${values.length}`);
}

export function appendTimelineCategoryClause(
  clauses: string[],
  values: unknown[],
  category: ListProjectTimelineInput['category'],
) {
  const noReminder = '(n.reminder_at IS NULL)';
  if (category === TimelineCategory.All) return;
  if (category === TimelineCategory.Reminder) {
    clauses.push('(n.reminder_at IS NOT NULL)');
    return;
  }
  clauses.push(noReminder);
  if (category === TimelineCategory.Github) {
    values.push(SourceChannel.Github);
    clauses.push(`n.source_channel = $${values.length}`);
    return;
  }
  if (category === TimelineCategory.Whatsapp) {
    values.push(SourceChannel.Whatsapp);
    clauses.push(`n.source_channel = $${values.length}`);
    return;
  }
  if (category === TimelineCategory.AiChat) {
    values.push(SourceChannel.AiChat);
    clauses.push(`n.source_channel = $${values.length}`);
    return;
  }
  if (category === TimelineCategory.DependencyWatcher) {
    values.push(SourceChannel.DependencyWatcher);
    clauses.push(`n.source_channel = $${values.length}`);
    return;
  }
  values.push(SourceChannel.Github, SourceChannel.Whatsapp, SourceChannel.AiChat, SourceChannel.DependencyWatcher);
  clauses.push(`n.source_channel <> $${values.length - 3}`);
  clauses.push(`n.source_channel <> $${values.length - 2}`);
  clauses.push(`n.source_channel <> $${values.length - 1}`);
  clauses.push(`n.source_channel <> $${values.length}`);
}

export function appendTimelineStatusClause(
  clauses: string[],
  values: unknown[],
  status: string | undefined,
  terminalStatuses: readonly string[],
) {
  if (!status) return;
  if (status === 'open') {
    values.push(terminalStatuses);
    clauses.push(`(n.status is null or n.status != all($${values.length}::note_status_enum[]))`);
  } else {
    values.push(status);
    clauses.push(`n.status::text = $${values.length}`);
  }
}

export function appendTimelineSearchClause(
  clauses: string[],
  values: unknown[],
  query: string | undefined,
) {
  if (!query || !query.trim()) return;
  values.push(`%${query.trim().toLowerCase()}%`);
  clauses.push(`(
    lower(n.title) like $${values.length} or 
    lower(coalesce(n.summary, '')) like $${values.length} or 
    lower(coalesce(n.body_search_text, '')) like $${values.length}
  )`);
}

export function appendKnowledgeMapFilters(
  clauses: string[],
  values: unknown[],
  category: ListProjectTimelineInput['category'],
  excludeReviewNotes?: boolean,
) {
  if (category !== TimelineCategory.DependencyWatcher) {
    values.push(SourceChannel.DependencyWatcher, 'dependency_watcher');
    clauses.push(`n.source_channel <> $${values.length - 1} and n.source_channel <> $${values.length} and n.source <> $${values.length - 1} and n.source <> $${values.length}`);
  }
  if (excludeReviewNotes) {
    values.push(SourceChannel.Github, EventType.CodeReview);
    clauses.push(`NOT (n.source_channel = $${values.length - 1} OR (n.metadata->>'eventType') = $${values.length})`);
  }
}

