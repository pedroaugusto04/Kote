import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, lt, inArray, sql } from 'drizzle-orm';

import { PostgresDatabase } from '../../../infrastructure/persistence/database.js';
import { EmailService } from '../email/email.service.js';
import { AppLogger } from '../../../observability/logger.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { users, notes, projects, workspaces, dependencyWatch, dependencyMonitoredRepositories } from '../../../infrastructure/persistence/schema/index.js';
import { UserRepository } from '../../ports/auth/auth.repository.js';
import { CredentialRepository } from '../../ports/integrations/integrations.repository.js';
import { WeeklySummaryGateway } from '../../ports/weekly-summary/weekly-summary.port.js';
import { WeeklySummaryQueuePublisher } from '../../ports/weekly-summary/weekly-summary-queue.publisher.js';
import { WeeklySummaryEmailMapper } from '../../mappers/weekly-summary-email.mapper.js';
import { AiProvider, IntegrationProvider, DependencyUrgency, SourceChannel } from '../../../contracts/enums.js';
import { isDependencyNote } from '../../../domain/utils/note-embedding.utils.js';
import type { WeeklySummaryAnalysis } from '../../../contracts/weekly-summary.js';

@Injectable()
export class WeeklySummaryService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly emailService: EmailService,
    private readonly users: UserRepository,
    private readonly logger: AppLogger,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly weeklySummaryGateway: WeeklySummaryGateway,
    private readonly weeklySummaryQueuePublisher: WeeklySummaryQueuePublisher,
    private readonly credentialRepository: CredentialRepository,
  ) {}

  async runForRange(startIso: string, endIso: string) {
    const db = this.db.getDb();
    const pageSize = 100;
    let offset = 0;

    while (true) {
      const counts = await db
        .select({ userId: notes.userId, note_count: count() })
        .from(notes)
        .where(and(
          gte(notes.createdAt, new Date(startIso)),
          lt(notes.createdAt, new Date(endIso)),
          sql`(${notes.sourceChannel} IS NULL OR (${notes.sourceChannel} <> ${SourceChannel.DependencyWatcher} AND ${notes.sourceChannel} <> 'dependency_watcher'))`,
          sql`(${notes.source} IS NULL OR (${notes.source} <> ${SourceChannel.DependencyWatcher} AND ${notes.source} <> 'dependency_watcher'))`,
        ))
        .groupBy(notes.userId)
        .orderBy(desc(count()))
        .limit(pageSize)
        .offset(offset);

      if (!counts.length) break;

      const userIds = counts.map((c: any) => String(c.userId));

      // fetch users in batch
      const userRows = await db
        .select({ id: users.id, email: users.email, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, userIds));

      const userMap = new Map(userRows.map((u: any) => [String(u.id), u]));

      for (const c of counts as any[]) {
        const uid = String(c.userId);
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
            noteCount: Number(c.note_count || 0),
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

  private async getDependencyCountsByProject(userId: string): Promise<Record<string, { critical: number; recommended: number; optional: number }>> {
    const db = this.db.getDb();

    // Get enabled workspaces for dependency watcher
    const enabledWorkspaces = await db
      .select({ id: workspaces.id, workspaceSlug: workspaces.workspaceSlug })
      .from(workspaces)
      .where(and(eq(workspaces.userId, userId), eq(workspaces.dependencyWatcherEnabled, true)));

    if (enabledWorkspaces.length === 0) return {};

    const workspaceIds = enabledWorkspaces.map((ws) => ws.id);
    const workspaceSlugMap = new Map(enabledWorkspaces.map((ws) => [ws.id, ws.workspaceSlug]));

    // Get dependency counts by urgency and workspace
    const dependencyCounts = await db
      .select({
        workspaceId: dependencyWatch.workspaceId,
        lastUrgency: dependencyWatch.lastUrgency,
        count: count(),
      })
      .from(dependencyWatch)
      .innerJoin(workspaces, eq(workspaces.id, dependencyWatch.workspaceId))
      .innerJoin(dependencyMonitoredRepositories, and(
        eq(dependencyMonitoredRepositories.userId, dependencyWatch.userId),
        eq(dependencyMonitoredRepositories.workspaceId, dependencyWatch.workspaceId),
        eq(dependencyMonitoredRepositories.repositoryId, dependencyWatch.repositoryId),
      ))
      .where(
        and(
          eq(dependencyWatch.userId, userId),
          inArray(dependencyWatch.workspaceId, workspaceIds),
          eq(workspaces.dependencyWatcherEnabled, true),
          eq(dependencyWatch.enabled, true),
          sql`${dependencyWatch.currentVersion} != ${dependencyWatch.latestSeenVersion}`,
        ),
      )
      .groupBy(dependencyWatch.workspaceId, dependencyWatch.lastUrgency);

    // Group by project (using workspaceSlug as project identifier)
    const result: Record<string, { critical: number; recommended: number; optional: number }> = {};

    for (const row of dependencyCounts as any[]) {
      const workspaceSlug = workspaceSlugMap.get(row.workspaceId) || 'unknown';
      if (!result[workspaceSlug]) {
        result[workspaceSlug] = { critical: 0, recommended: 0, optional: 0 };
      }

      const urgency = row.lastUrgency;
      if (urgency === DependencyUrgency.Critical) {
        result[workspaceSlug].critical = Number(row.count);
      } else if (urgency === DependencyUrgency.Recommended) {
        result[workspaceSlug].recommended = Number(row.count);
      } else if (urgency === DependencyUrgency.Optional) {
        result[workspaceSlug].optional = Number(row.count);
      }
    }

    return result;
  }

  async sendWeeklySummaryToUser(user: { id: string; email: string; displayName?: string }, userNotesByProject: Record<string, any[]>) {
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
    const userWorkspaces = await this.db.getDb().select({ workspaceSlug: workspaces.workspaceSlug })
      .from(workspaces)
      .where(eq(workspaces.userId, user.id));
    
    let hasUserReviewAiEnabled = false;
    for (const ws of userWorkspaces as any[]) {
      const credential = await this.credentialRepository.findCredential(user.id, ws.workspaceSlug, IntegrationProvider.AiReview);
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
    const dependencyCounts = await this.getDependencyCountsByProject(user.id);

    // Prepare payload for AI generation
    const aiPayload = {
      user: { displayName: user.displayName },
      projects: Object.entries(userNotesByProject).map(([projectSlug, items]) => ({
        projectName: projectSlug,
        noteCount: items.length,
        notes: (items as any[]).map((item) => ({
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

  async sendWeeklySummaryToUserForRange(userId: string, startIso: string, endIso: string): Promise<{ sent: boolean; reason: string; totalNotes: number }> {
    const db = this.db.getDb();

    const noteRows = await db
      .select({
        id: notes.id,
        userId: notes.userId,
        title: notes.title,
        summary: notes.summary,
        projectId: notes.projectId,
        createdAt: notes.createdAt,
        projectSlug: projects.projectSlug,
      })
      .from(notes)
      .leftJoin(projects, eq(projects.id, notes.projectId))
      .where(and(
        eq(notes.userId, userId),
        gte(notes.createdAt, new Date(startIso)),
        lt(notes.createdAt, new Date(endIso)),
        sql`(${notes.sourceChannel} IS NULL OR (${notes.sourceChannel} <> ${SourceChannel.DependencyWatcher} AND ${notes.sourceChannel} <> 'dependency_watcher'))`,
        sql`(${notes.source} IS NULL OR (${notes.source} <> ${SourceChannel.DependencyWatcher} AND ${notes.source} <> 'dependency_watcher'))`,
      ))
      .orderBy(desc(notes.createdAt));

    const userNotesByProject: Record<string, any[]> = {};
    for (const r of noteRows as any[]) {
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
