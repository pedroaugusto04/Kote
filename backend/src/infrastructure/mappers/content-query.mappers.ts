import { readEnvironment } from '../../adapters/environment.js';
import type { ReminderView } from '../../application/models/reminder.models.js';
import type { AttachmentRecord, NoteRecord } from '../../application/models/repository-records.models.js';
import type { ReviewView } from '../../application/models/review.models.js';
import type { VaultNoteDetail, VaultNoteSummary } from '../../application/models/vault-note.models.js';
import { resolveCanonicalTypeFromCategories } from '../../domain/note-classification.js';
import { EventType, SourceChannel } from '../../contracts/enums.js';


function attachmentContentPath(noteId: string, attachmentId: string): string {
  const encodedNoteId = encodeURIComponent(noteId);
  const encodedAttachmentId = encodeURIComponent(attachmentId);
  return `/notes/${encodedNoteId}/attachments/${encodedAttachmentId}/content`;
}

function reminderNoteText(record: Pick<NoteRecord, 'metadata' | 'summary' | 'title'>) {
  const rawText = String(record.metadata.rawText || '').trim();
  if (rawText) return rawText;
  const summary = String(record.summary || '').trim();
  return summary || String(record.title || '').trim();
}

export function noteSummary(record: NoteRecord): VaultNoteSummary {
  return {
    id: record.id,
    path: record.path,
    categories: record.categories,
    type: resolveCanonicalTypeFromCategories(record.categories || [], (record.categories || []).map((c) => c.id)),
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
  };
}

export function noteAttachment(noteId: string, attachment: AttachmentRecord) {
  const attachmentPath = attachmentContentPath(noteId, attachment.id);
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    url: `/api${attachmentPath}`,
  };
}

export function noteDetail(
  record: NoteRecord,
  attachments: AttachmentRecord[] = [],
  navigation?: { previous: { id: string; title: string } | null; next: { id: string; title: string } | null }
): VaultNoteDetail {
  return {
    ...noteSummary({ ...record, attachmentCount: attachments.length || record.attachmentCount || 0 }),
    markdown: record.markdown,
    frontmatter: {
      id: record.id,
      type: resolveCanonicalTypeFromCategories(record.categories || [], (record.categories || []).map((c) => c.id)),
      categories: record.categories.map((c) => c.name),
      workspace: record.workspaceSlug || '',
      source_channel: record.sourceChannel,
      event_type: String(record.metadata.eventType || ''),
      project: record.projectSlug || '',
      status: record.status,
      tags: record.tags,
      occurred_at: record.occurredAt || record.createdAt || '',
    },
    attachments: attachments.map((attachment) => noteAttachment(record.id, attachment)),
    editor: null,
    navigation: navigation || { previous: null, next: null },
  };
}

export function reviewFromNote(record: NoteRecord): ReviewView | null {
  const hasEventCategory = record.categories.some((c) => c.name === 'event');
  if (!hasEventCategory && record.metadata.eventType !== EventType.CodeReview) return null;
  if (record.metadata.eventType !== EventType.CodeReview && record.sourceChannel !== SourceChannel.Github) return null;
  const findings = Array.isArray(record.metadata.reviewFindings) ? record.metadata.reviewFindings : [];
  return {
    id: record.id,
    title: record.title,
    repo: String(record.metadata.repoFullName || ''),
    project: record.projectSlug || '',
    branch: String(record.metadata.branch || ''),
    date: record.occurredAt,
    status: record.status,
    summary: record.summary,
    impact: String(record.metadata.impact || ''),
    changedFiles: Array.isArray(record.metadata.changedFiles) ? record.metadata.changedFiles.map((item) => String(item)) : [],
    generatedNotePath: record.path,
    findings: findings.map((entry) => {
      const finding = entry as Record<string, unknown>;
      return {
        severity: String(finding.severity || 'medium'),
        file: String(finding.file || ''),
        line: Number(finding.line || 0),
        summary: String(finding.summary || ''),
        recommendation: String(finding.recommendation || ''),
      };
    }),
  };
}

export function reminderFromNote(record: NoteRecord): ReminderView | null {
  const reminderAt = record.reminderAt;
  if (!reminderAt) return null;
  return {
    id: record.id,
    title: record.title,
    noteText: reminderNoteText(record),
    project: record.projectSlug || '',
    workspace: record.workspaceSlug || '',
    status: record.status,
    isOverdue: false,
    reminderAt,
    relativePath: record.path,
  };
}
