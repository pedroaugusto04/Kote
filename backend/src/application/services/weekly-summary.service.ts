import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, lt, inArray } from 'drizzle-orm';

import { PostgresDatabase } from '../../infrastructure/persistence/database.js';
import { EmailService } from './email.service.js';
import { AppLogger } from '../../observability/logger.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { users, notes, projects, workspaces } from '../../infrastructure/persistence/schema/index.js';
import { UserRepository } from '../ports/auth/auth.repository.js';
import { CredentialRepository } from '../ports/integrations/integrations.repository.js';
import { WeeklySummaryGateway } from '../ports/weekly-summary/weekly-summary.port.js';
import { AiProvider, IntegrationProvider } from '../../contracts/enums.js';
import type { WeeklySummaryAnalysis } from '../../contracts/weekly-summary.js';

@Injectable()
export class WeeklySummaryService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly emailService: EmailService,
    private readonly users: UserRepository,
    private readonly logger: AppLogger,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly weeklySummaryGateway: WeeklySummaryGateway,
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
        .where(and(gte(notes.createdAt, new Date(startIso)), lt(notes.createdAt, new Date(endIso))))
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

      // fetch notes for these users in the given range
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
        .where(and(inArray(notes.userId, userIds), gte(notes.createdAt, new Date(startIso)), lt(notes.createdAt, new Date(endIso))))
        .orderBy(desc(notes.createdAt));

      // group notes by user -> project
      const grouped: Record<string, Record<string, any[]>> = {};
      for (const r of noteRows as any[]) {
        const uid = String(r.userId);
        const slug = r.projectSlug || 'inbox';
        grouped[uid] = grouped[uid] || {};
        grouped[uid][slug] = grouped[uid][slug] || [];
        grouped[uid][slug].push(r);
      }

      for (const c of counts as any[]) {
        const uid = String(c.userId);
        try {
          const user = userMap.get(uid) || await this.users.findUserById(uid);
          if (!user || !user.email) continue;

          const userNotesByProject = grouped[uid] || {};
          await this.sendWeeklySummaryToUser(user, userNotesByProject);
        } catch (err) {
          this.logger.error('weekly_summary.failed_send', { userId: uid, error: err instanceof Error ? err.message : String(err) });
        }
      }

      if (counts.length < pageSize) break;
      offset += pageSize;
    }
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

    const subject = `${appName} — Weekly summary (${totalNotes} new note${totalNotes > 1 ? 's' : ''})`;

    const textParts: string[] = [];
    textParts.push(`Hi ${user.displayName || ''},`);
    textParts.push('\n' + aiSummary.overview);
    textParts.push('\nKey Highlights:');
    for (const highlight of aiSummary.keyHighlights) {
      textParts.push(`- ${highlight}`);
    }
    textParts.push('\nBy Project:');
    for (const project of aiSummary.byProject) {
      textParts.push(`\n${project.projectName} (${project.noteCount} notes)`);
      textParts.push(project.summary);
      if (project.notableNotes.length > 0) {
        textParts.push('Notable notes:');
        for (const note of project.notableNotes) {
          textParts.push(`- ${note.title}: ${note.summary}`);
        }
      }
    }
    textParts.push('\nRecommendations:');
    for (const rec of aiSummary.recommendations) {
      textParts.push(`- ${rec}`);
    }
    textParts.push('\nThanks — sent by your KB');

    await this.emailService.sendEmail({
      to: user.email,
      subject,
      text: textParts.join('\n'),
      templateName: 'weekly-summary',
      templateData: {
        displayName: user.displayName || '',
        appName,
        aiSummary,
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
      .where(and(eq(notes.userId, userId), gte(notes.createdAt, new Date(startIso)), lt(notes.createdAt, new Date(endIso))))
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
