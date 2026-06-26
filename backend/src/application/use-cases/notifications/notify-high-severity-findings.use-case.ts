import { Injectable } from '@nestjs/common';

import { EmailService } from '../../../application/services/email.service.js';
import { UserRepository } from '../../ports/auth/auth.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import { buildWhatsappHighSeverityCodeReviewMessage } from '../../../domain/notifications.js';
import { type IngestPayload } from '../../../contracts/ingest.js';
import { desc, eq, and } from 'drizzle-orm';
import { PostgresDatabase } from '../../../infrastructure/persistence/database.js';
import { notes } from '../../../infrastructure/persistence/schema/index.js';

@Injectable()
export class NotifyHighSeverityFindingsService {
  constructor(
    private readonly emailService: EmailService,
    private readonly users: UserRepository,
    private readonly logger: AppLogger,
    private readonly db: PostgresDatabase,
  ) {}

  async sendEmailForHighFindings(payload: IngestPayload, userId: string, noteLink?: string): Promise<void> {
    try {
      const user = await this.users.findUserById(userId);
      const to = user?.email || '';
      if (!to) return;

      const text = buildWhatsappHighSeverityCodeReviewMessage(payload, noteLink);

      const sections = payload.content.sections;
      const findings = (sections.reviewFindings || []).filter((finding) => ['high', 'critical'].includes(finding.severity));
      const sha = String(payload.metadata.headSha || '').trim();
      const commitSha = sha ? sha.slice(0, 12) : 'unknown';

      await this.emailService.sendEmail({
        to,
        subject: `AI code review alert — ${String(payload.event?.projectSlug || '')}`,
        text,
        templateName: 'code-review-alert',
        templateData: {
          projectSlug: payload.event.projectSlug,
          repoFullName: String(payload.metadata.repoFullName || '').trim() || payload.source.conversationId || 'unknown',
          commitSha,
          compareUrl: String(payload.metadata.compareUrl || ''),
          noteLink: noteLink || '',
          summary: sections.summary || payload.content.rawText,
          impact: sections.impact || '',
          findings: findings.slice(0, 5).map((finding) => ({
            severity: finding.severity.toUpperCase(),
            file: finding.file || '',
            summary: finding.summary,
            recommendation: finding.recommendation || 'Review this issue before moving forward with the change.',
          })),
        },
      });
    } catch (error) {
      this.logger.warn('notify_high_findings.email_failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  async sendEmailForMostRecentNoteWithHighFindings(
    userId: string,
    noteLink?: string,
    noteId?: string,
  ): Promise<{ sent: boolean; noteId?: string; message?: string; totalFindings?: number; highSeverityFindings?: number }> {
    const db = this.db.getDb();
    let noteQuery = db
      .select({
        id: notes.id,
        title: notes.title,
        summary: notes.summary,
        projectId: notes.projectId,
        metadata: notes.metadata,
        createdAt: notes.createdAt,
      })
      .from(notes);

    if (noteId) {
      noteQuery = noteQuery.where(and(eq(notes.userId, userId), eq(notes.id, noteId))) as any;
    } else {
      noteQuery = noteQuery.where(eq(notes.userId, userId)).orderBy(desc(notes.createdAt)).limit(1) as any;
    }

    const noteRows = await noteQuery;

    if (!noteRows.length) {
      return { sent: false, message: noteId ? 'Note not found' : 'No notes found for this user' };
    }

    const note = noteRows[0] as any;
    const metadata = note.metadata || {};
    const reviewFindings = metadata.reviewFindings || [];

    if (!reviewFindings.length) {
      return { 
        sent: false, 
        noteId: note.id, 
        message: noteId 
          ? 'No review findings found in the note metadata' 
          : 'No review findings found in the most recent note metadata' 
      };
    }

    const hasHighSeverity = reviewFindings.some((f: any) => ['high', 'critical'].includes(f.severity));
    if (!hasHighSeverity) {
      return { 
        sent: false, 
        noteId: note.id, 
        message: noteId 
          ? 'No high/critical severity findings found in the note' 
          : 'No high/critical severity findings found in the most recent note' 
      };
    }

    const payload = {
      event: {
        projectSlug: metadata.projectSlug || 'inbox',
        type: 'code_review' as const,
        occurredAt: note.createdAt,
      },
      metadata: metadata,
      source: {
        conversationId: note.id,
      } as any,
      content: {
        rawText: note.summary || '',
        sections: {
          summary: metadata.summary || note.summary || '',
          impact: metadata.impact || '',
          reviewFindings: reviewFindings,
        },
      } as any,
    };

    await this.sendEmailForHighFindings(payload as any, userId, noteLink);

    return { 
      sent: true, 
      noteId: note.id,
      totalFindings: reviewFindings.length,
      highSeverityFindings: reviewFindings.filter((f: any) => ['high', 'critical'].includes(f.severity)).length 
    };
  }
}
