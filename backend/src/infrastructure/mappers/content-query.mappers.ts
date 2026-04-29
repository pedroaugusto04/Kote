import type { ReminderView } from '../../application/models/reminder.models.js';
import type { NoteRecord } from '../../application/models/repository-records.models.js';
import type { ReviewView } from '../../application/models/review.models.js';
import type { VaultNoteDetail, VaultNoteSummary } from '../../application/models/vault-note.models.js';

export function noteSummary(record: NoteRecord): VaultNoteSummary {
  return {
    id: record.id,
    path: record.path,
    type: record.type,
    title: record.title,
    project: record.projectSlug,
    workspace: record.workspaceSlug,
    tags: record.tags,
    date: record.occurredAt,
    status: record.status,
    summary: record.summary,
    source: record.source || record.sourceChannel,
  };
}

export function noteDetail(record: NoteRecord): VaultNoteDetail {
  return {
    ...noteSummary(record),
    markdown: record.markdown,
    frontmatter: record.frontmatter,
    links: record.links,
    origin: record.origin,
    editor: null,
  };
}

export function reviewFromNote(record: NoteRecord): ReviewView | null {
  if (record.type !== 'event' && record.metadata.eventType !== 'code_review') return null;
  if (record.metadata.eventType !== 'code_review' && record.sourceChannel !== 'github-push') return null;
  const findings = Array.isArray(record.metadata.reviewFindings) ? record.metadata.reviewFindings : [];
  return {
    id: record.id,
    title: record.title,
    repo: String(record.metadata.repoFullName || ''),
    project: record.projectSlug,
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
        status: String(finding.status || 'open'),
      };
    }),
  };
}

export function reminderFromNote(record: NoteRecord): ReminderView | null {
  if (record.type !== 'reminder') return null;
  return {
    id: record.id,
    title: record.title,
    project: record.projectSlug,
    workspace: record.workspaceSlug,
    status: record.status,
    reminderDate: String(record.metadata.reminderDate || ''),
    reminderTime: String(record.metadata.reminderTime || ''),
    reminderAt: String(record.metadata.reminderAt || ''),
    relativePath: record.path,
    sourceNotePath: String(record.metadata.sourceNotePath || ''),
  };
}
