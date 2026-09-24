import type { NoteRecord } from '../models/repository-records.models.js';
import type { VaultNoteSummary } from '../models/vault-note.models.js';
import { resolveCanonicalTypeFromCategories } from '../../domain/note-classification.js';
import { isNoteAiUsage } from '../../domain/ai-usage.js';

export function noteSummary(record: NoteRecord): VaultNoteSummary {
  return {
    id: record.id,
    path: record.path,
    categories: record.categories,
    type: resolveCanonicalTypeFromCategories(
      record.categories || [],
      (record.categories || []).map((c) => c.id),
    ),
    title: record.title,
    projectId: record.projectId,
    workspaceId: record.workspaceId,
    project: record.projectSlug || '',
    workspace: record.workspaceSlug || '',
    folderId: record.folderId,
    tags: record.tags,
    date: record.occurredAt || record.createdAt || '',
    status: record.status,
    summary: record.summary,
    source: record.source || record.sourceChannel,
    sourceChannel: record.sourceChannel,
    attachmentCount: record.attachmentCount || 0,
    isPinned: record.isPinned,
    ftsRank: record.ftsRank,
    aiUsage: isNoteAiUsage(record.metadata?.aiUsage) ? record.metadata.aiUsage : undefined,
  };
}
