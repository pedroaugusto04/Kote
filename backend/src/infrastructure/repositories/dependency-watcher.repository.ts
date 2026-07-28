import { Injectable } from '@nestjs/common';
import { eq, and, lt, or, inArray } from 'drizzle-orm';

import { dependencyWatch, dependencyMonitoredRepositories, workspaces } from '../persistence/schema/index.js';
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

  async batchUpsert(inputs: CreateDependencyWatchInput[]): Promise<void> {
    if (inputs.length === 0) return;

    const db = this.getDb();
    const userId = inputs[0].userId;
    const workspaceId = inputs[0].workspaceId;

    // Deduplicate inputs by ecosystem:packageName (keep last occurrence)
    const inputMap = new Map<string, CreateDependencyWatchInput>();
    for (const input of inputs) {
      const key = `${input.ecosystem}:${input.packageName}`;
      inputMap.set(key, input);
    }
    const deduplicatedInputs = Array.from(inputMap.values());

    // Fetch all existing records in one query
    const existingRecords = await db
      .select()
      .from(dependencyWatch)
      .where(
        and(
          eq(dependencyWatch.userId, userId),
          eq(dependencyWatch.workspaceId, workspaceId),
        ),
      );

    const existingMap = new Map(
      existingRecords.map((record) => [
        `${record.ecosystem}:${record.packageName}`,
        record,
      ]),
    );

    const toInsert: CreateDependencyWatchInput[] = [];
    const toUpdate: Array<{ id: string; input: CreateDependencyWatchInput }> = [];

    for (const input of deduplicatedInputs) {
      const key = `${input.ecosystem}:${input.packageName}`;
      const existing = existingMap.get(key);

      if (existing) {
        toUpdate.push({ id: existing.id, input });
      } else {
        toInsert.push(input);
      }
    }

    await db.transaction(async (tx) => {
      // Batch insert in chunks to avoid query size issues
      const CHUNK_SIZE = 50;
      for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
        const chunk = toInsert.slice(i, i + CHUNK_SIZE);
        if (chunk.length > 0) {
          await tx.insert(dependencyWatch).values(
            chunk.map((input) => ({
              userId: input.userId,
              workspaceId: input.workspaceId,
              ecosystem: input.ecosystem as any,
              packageName: input.packageName,
              currentVersion: input.currentVersion,
              repositoryId: input.repositoryId || null,
              enabled: true,
              checkIntervalHours: 24,
            })),
          );
        }
      }

      // Batch update
      for (const { id, input } of toUpdate) {
        await tx
          .update(dependencyWatch)
          .set({
            currentVersion: input.currentVersion,
            repositoryId: input.repositoryId,
            updatedAt: new Date(),
          })
          .where(eq(dependencyWatch.id, id));
      }
    });
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

  async findByRepositoryIds(userId: string, workspaceId: string, repositoryIds: string[]): Promise<DependencyWatchRecord[]> {
    if (repositoryIds.length === 0) return [];

    const db = this.getDb();
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
        lastUrgency: dependencyWatch.lastUrgency,
        enabled: dependencyWatch.enabled,
        repositoryId: dependencyWatch.repositoryId,
        createdAt: dependencyWatch.createdAt,
        updatedAt: dependencyWatch.updatedAt,
      })
      .from(dependencyWatch)
      .innerJoin(workspaces, eq(workspaces.id, dependencyWatch.workspaceId))
      .where(
        and(
          eq(dependencyWatch.userId, userId),
          eq(dependencyWatch.workspaceId, workspaceId),
          inArray(dependencyWatch.repositoryId, repositoryIds),
        ),
      );

    return records.map(this.mapToRecord);
  }

  async findById(userId: string, workspaceId: string, dependencyId: string): Promise<DependencyWatchRecord | null> {
    const db = this.getDb();
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
        and(
          eq(dependencyWatch.userId, userId),
          eq(dependencyWatch.workspaceId, workspaceId),
          eq(dependencyWatch.id, dependencyId),
        ),
      )
      .limit(1);

    if (records.length === 0) return null;
    return this.mapToRecord(records[0]);
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

  async batchUpdateLastCheckedAt(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const db = this.getDb();
    await db
      .update(dependencyWatch)
      .set({ lastCheckedAt: new Date(), updatedAt: new Date() })
      .where(inArray(dependencyWatch.id, ids));
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

  async deleteByRepositoryIds(userId: string, workspaceId: string, repositoryIds: string[]): Promise<void> {
    if (repositoryIds.length === 0) return;

    const db = this.getDb();
    await db
      .delete(dependencyWatch)
      .where(
        and(
          eq(dependencyWatch.userId, userId),
          eq(dependencyWatch.workspaceId, workspaceId),
          inArray(dependencyWatch.repositoryId, repositoryIds),
        ),
      );
  }

  async listMonitoredRepositoryIds(userId: string, workspaceId: string): Promise<string[]> {
    const db = this.getDb();
    const records = await db
      .select({ repositoryId: dependencyMonitoredRepositories.repositoryId })
      .from(dependencyMonitoredRepositories)
      .where(
        and(
          eq(dependencyMonitoredRepositories.userId, userId),
          eq(dependencyMonitoredRepositories.workspaceId, workspaceId),
        ),
      );

    return records.map((record) => record.repositoryId);
  }

  async setMonitoredRepositories(userId: string, workspaceId: string, repositoryIds: string[]): Promise<void> {
    const db = this.getDb();
    const uniqueRepositoryIds = [...new Set(repositoryIds)];

    await db.transaction(async (tx) => {
      await tx
        .delete(dependencyMonitoredRepositories)
        .where(
          and(
            eq(dependencyMonitoredRepositories.userId, userId),
            eq(dependencyMonitoredRepositories.workspaceId, workspaceId),
          ),
        );

      if (uniqueRepositoryIds.length === 0) return;

      await tx.insert(dependencyMonitoredRepositories).values(
        uniqueRepositoryIds.map((repositoryId) => ({
          userId,
          workspaceId,
          repositoryId,
        })),
      );
    });
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
      lastUrgency: record.lastUrgency || null,
      enabled: record.enabled,
      repositoryId: record.repositoryId || null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
