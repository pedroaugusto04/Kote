import { Injectable } from '@nestjs/common';

import { EmailService } from '../email/email.service.js';
import { AppLogger } from '../../../observability/logger.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { UserRepository } from '../../ports/auth/auth.repository.js';
import { CredentialRepository } from '../../ports/integrations/integrations.repository.js';
import { WeeklySummaryGateway } from '../../ports/weekly-summary/weekly-summary.port.js';
import { WeeklySummaryQueuePublisher } from '../../ports/weekly-summary/weekly-summary-queue.publisher.js';
import { WeeklySummaryRepository, type WeeklySummaryNoteRow } from '../../ports/weekly-summary/weekly-summary.repository.js';
import { WeeklySummaryEmailMapper } from '../../mappers/weekly-summary-email.mapper.js';
import { AiProvider, IntegrationProvider } from '../../../contracts/enums.js';
import type { WeeklySummaryAnalysis } from '../../../contracts/weekly-summary.js';

@Injectable()
export class WeeklySummaryService {
  constructor(
    private readonly weeklySummaryRepo: WeeklySummaryRepository,
    private readonly emailService: EmailService,
    private readonly users: UserRepository,
    private readonly logger: AppLogger,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly weeklySummaryGateway: WeeklySummaryGateway,
    private readonly weeklySummaryQueuePublisher: WeeklySummaryQueuePublisher,
    private readonly credentialRepository: CredentialRepository,
  ) {}

  async runForRange(startIso: string, endIso: string) {
    const pageSize = 100;
    let offset = 0;

    while (true) {
      const counts = await this.weeklySummaryRepo.listUserNoteCountsForRange(startIso, endIso, pageSize, offset);
      if (!counts.length) break;

      const userIds = counts.map((c) => c.userId);
      const userRows = await this.weeklySummaryRepo.listUsersByIds(userIds);
      const userMap = new Map(userRows.map((u) => [u.id, u]));

      for (const c of counts) {
        const uid = c.userId;
        try {
          const user = userMap.get(uid) || await this.users.findUserById(uid);
          if (!user || !user.email) continue;

          await this.weeklySummaryQueuePublisher.publishWeeklySummaryJob({
            userId: uid,
            startIso,
            endIso,
          });

          this.logger.info('weekly_summary.job_enqueued', {
            userId: uid,
            noteCount: c.noteCount,
          });
        } catch (err) {
          this.logger.error('weekly_summary.job_enqueue_failed', {
            userId: uid,
            error: err instanceof Error ? err.message : String(err),
          });

          await this.sendWeeklySummaryToUserForRange(uid, startIso, endIso);
        }
      }

      if (counts.length < pageSize) break;
      offset += pageSize;
    }
  }

  async sendWeeklySummaryToUser(
    user: { id: string; email: string; displayName?: string | null },
    userNotesByProject: Record<string, WeeklySummaryNoteRow[]>,
  ) {
    const totalNotes = Object.values(userNotesByProject).reduce((s, arr) => s + arr.length, 0);
    if (totalNotes === 0) return { sent: false, reason: 'no_notes', totalNotes: 0 };

    const environment = this.environmentProvider.read();
    const rawFrom = String(environment.emailFrom || '');
    const displayFromMatch = rawFrom.match(/^\s*([^<]+)\s*</);
    const appName = displayFromMatch && displayFromMatch[1] ? displayFromMatch[1].trim() : 'Kote';

    // Check if review AI is active globally
    if (environment.reviewAiProvider === AiProvider.None) {
      this.logger.info('weekly_summary.skipped_review_ai_inactive_global', { userId: user.id });
      return { sent: false, reason: 'review_ai_inactive', totalNotes };
    }

    // Check if user has review AI enabled in their workspace credentials
    const userWorkspaceSlugs = await this.weeklySummaryRepo.listUserWorkspaceSlugs(user.id);
    let hasUserReviewAiEnabled = false;
    for (const slug of userWorkspaceSlugs) {
      const credential = await this.credentialRepository.findCredential(user.id, slug, IntegrationProvider.AiReview);
      if (credential && credential.status === 'connected') {
        hasUserReviewAiEnabled = true;
        break;
      }
    }

    if (!hasUserReviewAiEnabled) {
      this.logger.info('weekly_summary.skipped_user_review_ai_inactive', { userId: user.id });
      return { sent: false, reason: 'user_review_ai_inactive', totalNotes };
    }

    // Get dependency counts
    const dependencyCounts = await this.weeklySummaryRepo.getDependencyCountsByProject(user.id);

    // Prepare payload for AI generation
    const aiPayload = {
      user: { displayName: user.displayName || undefined },
      projects: Object.entries(userNotesByProject).map(([projectSlug, items]) => ({
        projectName: projectSlug,
        noteCount: items.length,
        notes: items.map((item) => ({
          title: item.title,
          summary: item.summary || '',
          date: new Date(item.createdAt).toISOString().slice(0, 10),
        })),
      })),
    };

    // Generate AI summary
    const aiSummary: WeeklySummaryAnalysis = await this.weeklySummaryGateway.generate(
      {
        provider: environment.reviewAiProvider,
        baseUrl: environment.reviewAiBaseUrl || '',
        model: environment.reviewAiModel || '',
        apiKey: environment.reviewAiApiKey || '',
      },
      aiPayload,
    );

    const subject = WeeklySummaryEmailMapper.toSubject(appName, totalNotes);
    const text = WeeklySummaryEmailMapper.toTextContent(user.displayName, appName, aiSummary);

    await this.emailService.sendEmail({
      to: user.email,
      subject,
      text,
      templateName: 'weekly-summary',
      templateData: {
        displayName: user.displayName || '',
        appName,
        aiSummary,
        dependencyCounts,
      },
    });

    return { sent: true, reason: 'sent', totalNotes };
  }

  async sendWeeklySummaryToUserForRange(
    userId: string,
    startIso: string,
    endIso: string,
  ): Promise<{ sent: boolean; reason: string; totalNotes: number }> {
    const noteRows = await this.weeklySummaryRepo.listNotesForUserRange(userId, startIso, endIso);

    const userNotesByProject: Record<string, WeeklySummaryNoteRow[]> = {};
    for (const r of noteRows) {
      const slug = r.projectSlug || 'inbox';
      userNotesByProject[slug] = userNotesByProject[slug] || [];
      userNotesByProject[slug].push(r);
    }

    const user = await this.users.findUserById(userId);
    if (!user || !user.email) {
      throw new Error(`User with id ${userId} not found or has no email`);
    }

    return this.sendWeeklySummaryToUser(user, userNotesByProject);
  }
}
