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
      const html = `<div style="font-family:system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; white-space:pre-wrap">${this.escapeHtml(text)}</div>`;

      await this.emailService.sendEmail({
        to,
        subject: `AI code review alert — ${String(payload.event?.projectSlug || '')}`,
        text,
        html,
        templateName: 'code-review-alert',
        templateData: { payload, noteLink },
      });
    } catch (error) {
      this.logger.warn('notify_high_findings.email_failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private escapeHtml(input: string): string {
    return String(input || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
  }
}
