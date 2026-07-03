import { Injectable } from '@nestjs/common';
import { eq, and, or, desc } from 'drizzle-orm';

import {
  GithubBackfillJobRepository,
  type GithubBackfillJobRecord,
  type CreateGithubBackfillJobInput,
  type UpdateGithubBackfillJobInput,
} from '../../application/ports/integrations/github-backfill-job.repository.js';
import type { GithubBackfillJobStatus } from '../../application/use-cases/integrations/github-backfill.use-case.js';
import { PostgresDatabase } from '../persistence/database.js';
import { githubBackfillJobs } from '../persistence/schema/index.js';

function nowIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value || new Date().toISOString());
}

function rowToRecord(row: Record<string, unknown>): GithubBackfillJobRecord {
  return {
    id: String(row.id || ''),
    userId: String(row.userId || ''),
    workspaceSlug: String(row.workspaceSlug || ''),
    repositories: Array.isArray(row.repositories) ? (row.repositories as string[]) : [],
    status: String(row.status || 'queued') as GithubBackfillJobStatus,
    total: Number(row.total ?? 0),
    processed: Number(row.processed ?? 0),
    imported: Number(row.imported ?? 0),
    skipped: Number(row.skipped ?? 0),
    limit: Number(row.limit ?? 5),
    error: row.error != null ? String(row.error) : null,
    startedAt: nowIso(row.startedAt),
    updatedAt: nowIso(row.updatedAt),
    completedAt: row.completedAt != null ? nowIso(row.completedAt) : null,
  };
}

@Injectable()
export class PostgresGithubBackfillJobRepository extends GithubBackfillJobRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async create(input: CreateGithubBackfillJobInput): Promise<GithubBackfillJobRecord> {
    const db = this.database.getDb();
    const result = await db
      .insert(githubBackfillJobs)
      .values({
        id: input.id,
        userId: input.userId,
        workspaceSlug: input.workspaceSlug,
        repositories: input.repositories,
        status: 'queued',
        total: input.total,
        limit: input.limit,
      })
      .returning();

    return rowToRecord(result[0] as Record<string, unknown>);
  }

  async findById(jobId: string, userId: string): Promise<GithubBackfillJobRecord | null> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(githubBackfillJobs)
      .where(and(eq(githubBackfillJobs.id, jobId), eq(githubBackfillJobs.userId, userId)))
      .limit(1);

    return result[0] ? rowToRecord(result[0] as Record<string, unknown>) : null;
  }

  async findByIdUnchecked(jobId: string): Promise<GithubBackfillJobRecord | null> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(githubBackfillJobs)
      .where(eq(githubBackfillJobs.id, jobId))
      .limit(1);

    return result[0] ? rowToRecord(result[0] as Record<string, unknown>) : null;
  }

  async update(jobId: string, patch: UpdateGithubBackfillJobInput): Promise<void> {
    const db = this.database.getDb();
    const values: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (patch.status !== undefined) values.status = patch.status;
    if (patch.total !== undefined) values.total = patch.total;
    if (patch.processed !== undefined) values.processed = patch.processed;
    if (patch.imported !== undefined) values.imported = patch.imported;
    if (patch.skipped !== undefined) values.skipped = patch.skipped;
    if (patch.error !== undefined) values.error = patch.error;
    if (patch.completedAt !== undefined) {
      values.completedAt = patch.completedAt ? new Date(patch.completedAt) : null;
    }

    await db
      .update(githubBackfillJobs)
      .set(values)
      .where(eq(githubBackfillJobs.id, jobId));
  }

  async findCompletedByWorkspace(userId: string, workspaceSlug: string): Promise<GithubBackfillJobRecord | null> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(githubBackfillJobs)
      .where(
        and(
          eq(githubBackfillJobs.userId, userId),
          eq(githubBackfillJobs.workspaceSlug, workspaceSlug),
          or(
            eq(githubBackfillJobs.status, 'completed'),
            eq(githubBackfillJobs.status, 'quota_exceeded'),
          ),
        ),
      )
      .orderBy(desc(githubBackfillJobs.completedAt))
      .limit(1);

    return result[0] ? rowToRecord(result[0] as Record<string, unknown>) : null;
  }
}
