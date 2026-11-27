import type { ReminderView } from '../../application/models/reminder.models.js';
import type { AttachmentRecord, NoteRecord } from '../../application/models/repository-records.models.js';
import type { ReviewView } from '../../application/models/review.models.js';
import type { VaultNoteDetail } from '../../application/models/vault-note.models.js';
import { EventType, SourceChannel } from '../../contracts/enums.js';
import type { NoteSynthesisRecord } from '../../application/models/note-synthesis.models.js';
import { NoteSynthesisStatus } from '../../application/constants/ai-session-synthesis.constants.js';
import { isSynthesisFresh } from '../../application/services/content/ai-session-synthesis-transcript.service.js';
import { noteSummary } from '../../application/mappers/vault-note.mapper.js';

function attachmentContentPath(noteId: string, attachmentId: string): string {
  const encodedNoteId = encodeURIComponent(noteId);
  const encodedAttachmentId = encodeURIComponent(attachmentId);
  return `/notes/${encodedNoteId}/attachments/${encodedAttachmentId}/content`;
}

export function reminderNoteText(record: Pick<NoteRecord, 'summary' | 'title'> & { metadata: unknown }) {
  const metadata = record.metadata as NoteRecord['metadata'] | null;
  const rawText = String(metadata?.rawText || '').trim();
  if (rawText) return rawText;
  const summary = String(record.summary || '').trim();
  return summary || String(record.title || '').trim();
}

export function noteAttachment(noteId: string, attachment: AttachmentRecord) {
  const attachmentPath = attachmentContentPath(noteId, attachment.id);
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    url: `/kote/api${attachmentPath}`,
  };
}

export function noteDetail(
  record: NoteRecord,
  attachments: AttachmentRecord[] = [],
  navigation: VaultNoteDetail['navigation'] = { previous: null, next: null },
  synthesis?: NoteSynthesisRecord | null,
): VaultNoteDetail {
  const summary = noteSummary(record);
  return {
    ...summary,
    attachmentCount: attachments.length || summary.attachmentCount,
    markdown: record.markdown,
    attachments: attachments.map((attachment) => noteAttachment(record.id, attachment)),
    editor: null,
    navigation,
    // Never expose a completed synthesis for a different transcript version.
    synthesis: synthesis ? (() => {
      const isStaleCompleted = synthesis.status === NoteSynthesisStatus.Completed && !isSynthesisFresh(synthesis, record.markdown);
      return {
        status: isStaleCompleted ? NoteSynthesisStatus.Pending : synthesis.status,
        mode: synthesis.mode,
        overview: isStaleCompleted ? '' : synthesis.overview,
        memory: isStaleCompleted ? [] : synthesis.memory,
        availableAt: synthesis.availableAt || null,
        generatedAt: synthesis.generatedAt,
        sourceHash: synthesis.sourceHash,
      };
    })() : null,
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
