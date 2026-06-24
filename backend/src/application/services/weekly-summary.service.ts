import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, lt, inArray } from 'drizzle-orm';

import { PostgresDatabase } from '../../infrastructure/persistence/database.js';
import { EmailService } from './email.service.js';
import { AppLogger } from '../../observability/logger.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { users, notes, projects } from '../../infrastructure/persistence/schema/index.js';
import { UserRepository } from '../ports/auth/auth.repository.js';

@Injectable()
export class WeeklySummaryService {
  constructor(
    private readonly db: PostgresDatabase,
    private readonly emailService: EmailService,
    private readonly users: UserRepository,
    private readonly logger: AppLogger,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
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
          const totalNotes = Object.values(userNotesByProject).reduce((s, arr) => s + arr.length, 0);
          if (totalNotes === 0) continue;

          const environment = this.environmentProvider.read();
          const appName = (environment.emailFrom || 'Knowledge Base').split('@')[0];
          const subject = `${appName} — Weekly summary (${totalNotes} new note${totalNotes > 1 ? 's' : ''})`;

          const textParts: string[] = [];
          textParts.push(`Hi ${user.displayName || ''},`);
          textParts.push('Here is your weekly activity summary:');
          for (const [project, items] of Object.entries(userNotesByProject)) {
            textParts.push(`\nProject: ${project} — ${items.length} note${items.length > 1 ? 's' : ''}`);
            for (const item of items as any[]) {
              textParts.push(`- ${item.title} (${new Date(item.createdAt).toISOString().slice(0, 10)})`);
            }
          }
          textParts.push('\nThanks — sent by your KB');

          const projects = Object.entries(userNotesByProject).map(([projectSlug, items]) => ({
            projectName: projectSlug,
            count: items.length,
            notes: (items as any[]).map((item) => ({
              title: item.title,
              date: new Date(item.createdAt).toISOString().slice(0, 10),
            })),
          }));

          await this.emailService.sendEmail({
            to: user.email,
            subject,
            text: textParts.join('\n'),
            templateName: 'weekly-summary',
            templateData: {
              displayName: user.displayName || '',
              appName,
              projects,
            },
          });
        } catch (err) {
          this.logger.error('weekly_summary.failed_send', { userId: uid, error: err instanceof Error ? err.message : String(err) });
        }
      }

      if (counts.length < pageSize) break;
      offset += pageSize;
    }
  }
}
