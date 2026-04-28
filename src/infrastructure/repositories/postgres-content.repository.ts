import { Injectable } from '@nestjs/common';

import type { ReminderView } from '../../application/models/reminder.models.js';
import type { NoteRecord } from '../../application/models/repository-records.models.js';
import type { ReviewView } from '../../application/models/review.models.js';
import type { VaultNoteDetail, VaultNoteSummary } from '../../application/models/vault-note.models.js';
import { KnowledgeStore } from '../../application/knowledge-store.js';
import { ContentQueryRepository } from '../../application/ports/repositories.js';

function noteSummary(record: NoteRecord): VaultNoteSummary {
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

function noteDetail(record: NoteRecord): VaultNoteDetail {
  return {
    ...noteSummary(record),
    markdown: record.markdown,
    frontmatter: record.frontmatter,
    links: record.links,
    origin: record.origin,
  };
}

function reviewFromNote(record: NoteRecord): ReviewView | null {
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

function reminderFromNote(record: NoteRecord): ReminderView | null {
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

@Injectable()
export class PostgresContentQueryRepository extends ContentQueryRepository {
  constructor(private readonly store: KnowledgeStore) {
    super();
  }

  async list(userId: string): Promise<VaultNoteSummary[]> {
    return (await this.store.listNotes(userId)).map(noteSummary);
  }

  async getById(userId: string, id: string): Promise<VaultNoteDetail | null> {
    const note = await this.store.getNoteById(userId, id);
    return note ? noteDetail(note) : null;
  }

  async listReviews(userId: string): Promise<ReviewView[]> {
    return (await this.store.listNotes(userId)).map(reviewFromNote).filter((review): review is ReviewView => Boolean(review));
  }

  async listReminders(userId: string): Promise<ReminderView[]> {
    return (await this.store.listNotes(userId)).map(reminderFromNote).filter((reminder): reminder is ReminderView => Boolean(reminder));
  }
}
