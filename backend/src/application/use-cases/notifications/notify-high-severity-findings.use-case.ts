import { Injectable } from '@nestjs/common';

import { EmailService } from '../../../application/services/email.service.js';
import { UserRepository } from '../../ports/auth/auth.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import { buildWhatsappHighSeverityCodeReviewMessage } from '../../../domain/notifications.js';
import { type IngestPayload } from '../../../contracts/ingest.js';

@Injectable()
export class NotifyHighSeverityFindingsService {
  constructor(
    private readonly emailService: EmailService,
    private readonly users: UserRepository,
    private readonly logger: AppLogger,
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
}
