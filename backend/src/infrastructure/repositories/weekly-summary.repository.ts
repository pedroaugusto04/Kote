import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import {
  WeeklySummaryRepository,
  type WeeklySummaryCriticalDependency,
  type WeeklySummaryNoteRow,
  type WeeklySummaryUser,
  type WeeklySummaryUserNoteCount,
} from '../../application/ports/weekly-summary/weekly-summary.repository.js';
import { DependencyUrgency, SourceChannel } from '../../contracts/enums.js';
import { PostgresDatabase } from '../persistence/database.js';
import {
  dependencyMonitoredRepositories,
  dependencyWatch,
  notes,
  projectRepositories,
  projects,
  users,
  workspaces,
} from '../persistence/schema/index.js';

@Injectable()
export class PostgresWeeklySummaryRepository extends WeeklySummaryRepository {
  constructor(private readonly db: PostgresDatabase) {
    super();
  }

  async listUserNoteCountsForRange(
    startIso: string,
    endIso: string,
    limit: number,
    offset: number,
  ): Promise<WeeklySummaryUserNoteCount[]> {
    const database = this.db.getDb();
    const rows = await database
      .select({ userId: notes.userId, note_count: count() })
      .from(notes)
      .where(
        and(
          gte(notes.createdAt, new Date(startIso)),
          lt(notes.createdAt, new Date(endIso)),
          sql`(${notes.sourceChannel} IS NULL OR (${notes.sourceChannel} <> ${SourceChannel.DependencyWatcher} AND ${notes.sourceChannel} <> 'dependency_watcher'))`,
          sql`(${notes.source} IS NULL OR (${notes.source} <> ${SourceChannel.DependencyWatcher} AND ${notes.source} <> 'dependency_watcher'))`,
        ),
      )
      .groupBy(notes.userId)
      .orderBy(desc(count()))
      .limit(limit)
      .offset(offset);

    return rows.map((r: { userId: string; note_count: number }) => ({
      userId: String(r.userId),
      noteCount: Number(r.note_count || 0),
    }));
  }

  async listUsersByIds(userIds: string[]): Promise<WeeklySummaryUser[]> {
    if (userIds.length === 0) return [];
    const database = this.db.getDb();
    const rows = await database
      .select({ id: users.id, email: users.email, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, userIds));

    return rows.map((u: { id: string; email: string; displayName: string | null }) => ({
      id: String(u.id),
      email: String(u.email),
      displayName: u.displayName ? String(u.displayName) : null,
    }));
  }

  async getCriticalDependencyUpdates(
    userId: string,
  ): Promise<WeeklySummaryCriticalDependency[]> {
    const database = this.db.getDb();
    const enabledWorkspaces = await database
      .select({ id: workspaces.id, workspaceSlug: workspaces.workspaceSlug })
      .from(workspaces)
      .where(and(eq(workspaces.userId, userId), eq(workspaces.dependencyWatcherEnabled, true)));

    if (enabledWorkspaces.length === 0) return [];

    const workspaceIds = enabledWorkspaces.map((ws: { id: string }) => ws.id);
    const workspaceSlugMap = new Map(enabledWorkspaces.map((ws: { id: string; workspaceSlug: string }) => [ws.id, ws.workspaceSlug]));

    const records = await database
      .select({
        id: dependencyWatch.id,
        workspaceId: dependencyWatch.workspaceId,
        ecosystem: dependencyWatch.ecosystem,
        packageName: dependencyWatch.packageName,
        currentVersion: dependencyWatch.currentVersion,
        latestSeenVersion: dependencyWatch.latestSeenVersion,
        repositoryId: dependencyWatch.repositoryId,
        projectDisplayName: projects.displayName,
      })
      .from(dependencyWatch)
      .innerJoin(workspaces, eq(workspaces.id, dependencyWatch.workspaceId))
      .leftJoin(projectRepositories, eq(projectRepositories.repositoryId, dependencyWatch.repositoryId))
      .leftJoin(projects, eq(projects.id, projectRepositories.projectId))
      .where(
        and(
          eq(dependencyWatch.userId, userId),
          inArray(dependencyWatch.workspaceId, workspaceIds),
          eq(workspaces.dependencyWatcherEnabled, true),
          eq(dependencyWatch.enabled, true),
          eq(dependencyWatch.lastUrgency, DependencyUrgency.Critical),
          sql`${dependencyWatch.latestSeenVersion} != ''`,
          sql`${dependencyWatch.currentVersion} != ${dependencyWatch.latestSeenVersion}`,
        ),
      )
      .orderBy(dependencyWatch.packageName);

    const seen = new Set<string>();
    const result: WeeklySummaryCriticalDependency[] = [];

    for (const row of records) {
      const workspaceSlug = workspaceSlugMap.get(row.workspaceId) || '';
      const key = `${row.workspaceId}:${row.ecosystem}:${row.packageName}`;
      if (seen.has(key)) continue;
      seen.add(key);

      result.push({
        packageName: row.packageName,
        currentVersion: row.currentVersion,
        latestVersion: row.latestSeenVersion,
        ecosystem: row.ecosystem,
        workspaceSlug,
        projectName: row.projectDisplayName || null,
      });
    }

    return result;
  }

  async listUserWorkspaceSlugs(userId: string): Promise<string[]> {
    const database = this.db.getDb();
    const userWorkspaces = await database
      .select({ workspaceSlug: workspaces.workspaceSlug })
      .from(workspaces)
      .where(eq(workspaces.userId, userId));

    return userWorkspaces.map((w: { workspaceSlug: string }) => String(w.workspaceSlug));
  }

  async listNotesForUserRange(
    userId: string,
    startIso: string,
    endIso: string,
  ): Promise<WeeklySummaryNoteRow[]> {
    const database = this.db.getDb();
    const noteRows = await database
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
      .where(
        and(
          eq(notes.userId, userId),
          gte(notes.createdAt, new Date(startIso)),
          lt(notes.createdAt, new Date(endIso)),
          sql`(${notes.sourceChannel} IS NULL OR (${notes.sourceChannel} <> ${SourceChannel.DependencyWatcher} AND ${notes.sourceChannel} <> 'dependency_watcher'))`,
          sql`(${notes.source} IS NULL OR (${notes.source} <> ${SourceChannel.DependencyWatcher} AND ${notes.source} <> 'dependency_watcher'))`,
        ),
      )
      .orderBy(desc(notes.createdAt));

    return noteRows.map((r) => ({
      id: String(r.id),
      userId: String(r.userId),
      title: String(r.title),
      summary: r.summary ? String(r.summary) : null,
      projectId: r.projectId ? String(r.projectId) : null,
      createdAt: r.createdAt,
      projectSlug: r.projectSlug ? String(r.projectSlug) : null,
    }));
  }
}
