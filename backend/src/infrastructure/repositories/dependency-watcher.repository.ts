import { Injectable } from '@nestjs/common';
import { eq, and, lt, or } from 'drizzle-orm';

import { dependencyWatch, workspaces } from '../persistence/schema/index.js';
import { PostgresDatabase } from '../persistence/database.js';
import { DependencyWatcherRepository, type DependencyWatchRecord, type CreateDependencyWatchInput, type UpdateDependencyWatchInput } from '../../application/ports/dependency-watcher/dependency-watcher.repository.js';
import { DependencyEcosystem } from '../../domain/enums/dependency.enums.js';

@Injectable()
export class PostgresDependencyWatcherRepository extends DependencyWatcherRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  private getDb() {
    return this.database.getDb();
  }

  async upsert(input: CreateDependencyWatchInput): Promise<DependencyWatchRecord> {
    const db = this.getDb();
    const existing = await db
      .select()
      .from(dependencyWatch)
      .where(
        and(
          eq(dependencyWatch.userId, input.userId),
          eq(dependencyWatch.workspaceId, input.workspaceId),
          eq(dependencyWatch.ecosystem, input.ecosystem as any),
          eq(dependencyWatch.packageName, input.packageName),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(dependencyWatch)
        .set({
          currentVersion: input.currentVersion,
          repositoryId: input.repositoryId || existing[0].repositoryId,
          updatedAt: new Date(),
        })
        .where(eq(dependencyWatch.id, existing[0].id))
        .returning();

      return this.mapToRecord(updated);
    }

    const [inserted] = await db
      .insert(dependencyWatch)
      .values({
        userId: input.userId,
        workspaceId: input.workspaceId,
        ecosystem: input.ecosystem as any,
        packageName: input.packageName,
        currentVersion: input.currentVersion,
        repositoryId: input.repositoryId || null,
        enabled: true,
        checkIntervalHours: 24,
      })
      .returning();

    return this.mapToRecord(inserted);
  }

  async findByUserAndWorkspace(userId: string, workspaceId: string): Promise<DependencyWatchRecord[]> {
    const db = this.getDb();
    const records = await db
      .select()
      .from(dependencyWatch)
      .where(
        and(
          eq(dependencyWatch.userId, userId),
          eq(dependencyWatch.workspaceId, workspaceId),
        ),
      );

    return records.map(this.mapToRecord);
  }

  async findDueForCheck(hours: number): Promise<DependencyWatchRecord[]> {
    const db = this.getDb();
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);

    const records = await db
      .select({
        id: dependencyWatch.id,
        userId: dependencyWatch.userId,
        workspaceId: dependencyWatch.workspaceId,
        workspaceSlug: workspaces.workspaceSlug,
        ecosystem: dependencyWatch.ecosystem,
        packageName: dependencyWatch.packageName,
        currentVersion: dependencyWatch.currentVersion,
        latestSeenVersion: dependencyWatch.latestSeenVersion,
        checkIntervalHours: dependencyWatch.checkIntervalHours,
        lastCheckedAt: dependencyWatch.lastCheckedAt,
        lastAlertedAt: dependencyWatch.lastAlertedAt,
        enabled: dependencyWatch.enabled,
        repositoryId: dependencyWatch.repositoryId,
        createdAt: dependencyWatch.createdAt,
        updatedAt: dependencyWatch.updatedAt,
      })
      .from(dependencyWatch)
      .innerJoin(workspaces, eq(workspaces.id, dependencyWatch.workspaceId))
      .where(
        or(
          eq(dependencyWatch.lastCheckedAt, null as any),
          lt(dependencyWatch.lastCheckedAt, cutoffDate),
        ),
      );

    return records.map(this.mapToRecord);
  }

  async update(id: string, input: UpdateDependencyWatchInput): Promise<void> {
    const db = this.getDb();
    await db
      .update(dependencyWatch)
      .set({
        ...(input.latestSeenVersion !== undefined && { latestSeenVersion: input.latestSeenVersion }),
        ...(input.lastCheckedAt !== undefined && { lastCheckedAt: input.lastCheckedAt }),
        ...(input.lastAlertedAt !== undefined && { lastAlertedAt: input.lastAlertedAt }),
        ...(input.enabled !== undefined && { enabled: input.enabled }),
        updatedAt: new Date(),
      })
      .where(eq(dependencyWatch.id, id));
  }

  async delete(id: string): Promise<void> {
    const db = this.getDb();
    await db.delete(dependencyWatch).where(eq(dependencyWatch.id, id));
  }

  async deleteByWorkspace(userId: string, workspaceId: string): Promise<void> {
    const db = this.getDb();
    await db
      .delete(dependencyWatch)
      .where(
        and(
          eq(dependencyWatch.userId, userId),
          eq(dependencyWatch.workspaceId, workspaceId),
        ),
      );
  }

  async isWorkspaceEnabled(workspaceId: string): Promise<boolean> {
    const db = this.getDb();
    const [workspace] = await db
      .select({ dependencyWatcherEnabled: workspaces.dependencyWatcherEnabled })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    return workspace?.dependencyWatcherEnabled ?? false;
  }

  private mapToRecord(record: any): DependencyWatchRecord {
    return {
      id: record.id,
      userId: record.userId,
      workspaceId: record.workspaceId,
      workspaceSlug: record.workspaceSlug || '',
      ecosystem: record.ecosystem,
      packageName: record.packageName,
      currentVersion: record.currentVersion,
      latestSeenVersion: record.latestSeenVersion || '',
      checkIntervalHours: record.checkIntervalHours,
      lastCheckedAt: record.lastCheckedAt || null,
      lastAlertedAt: record.lastAlertedAt || null,
      enabled: record.enabled,
      repositoryId: record.repositoryId || null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
