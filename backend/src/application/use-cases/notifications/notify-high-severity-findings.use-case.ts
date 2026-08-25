import { Injectable } from '@nestjs/common';

import { EmailService } from '../../services/email/email.service.js';
import { UserRepository } from '../../ports/auth/auth.repository.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import { buildWhatsappHighSeverityCodeReviewMessage } from '../../../domain/notifications.js';
import { type IngestPayload } from '../../../contracts/ingest.js';

@Injectable()
export class NotifyHighSeverityFindingsService {
  constructor(
    private readonly emailService: EmailService,
    private readonly users: UserRepository,
    private readonly logger: AppLogger,
    private readonly contentRepository: ContentRepository,
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
    const note = noteId
      ? await this.contentRepository.getNoteById(userId, noteId)
      : await this.contentRepository.getLatestNote(userId);

    if (!note) {
      return { sent: false, message: noteId ? 'Note not found' : 'No notes found for this user' };
    }

    const metadata = (note.metadata as Record<string, any>) || {};
    const reviewFindings = (metadata.reviewFindings as Array<{ severity: string; file?: string; summary: string; recommendation?: string }>) || [];

    if (!reviewFindings.length) {
      return { 
        sent: false, 
        noteId: note.id, 
        message: noteId 
          ? 'No review findings found in the note metadata' 
          : 'No review findings found in the most recent note metadata' 
      };
    }

    const hasHighSeverity = reviewFindings.some((f) => ['high', 'critical'].includes(f.severity));
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
        projectSlug: (metadata.projectSlug as string) || 'inbox',
        type: 'code_review',
        occurredAt: note.createdAt || note.occurredAt || new Date().toISOString(),
      },
      metadata: metadata,
      source: {
        conversationId: note.id,
      },
      content: {
        rawText: note.summary || '',
        sections: {
          summary: (metadata.summary as string) || note.summary || '',
          impact: (metadata.impact as string) || '',
          reviewFindings: reviewFindings,
        },
      },
    } as unknown as IngestPayload;

    await this.sendEmailForHighFindings(payload, userId, noteLink);

    return { 
      sent: true, 
      noteId: note.id,
      totalFindings: reviewFindings.length,
      highSeverityFindings: reviewFindings.filter((f) => ['high', 'critical'].includes(f.severity)).length 
    };
  }
}

