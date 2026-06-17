import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { eq, and, desc, count } from 'drizzle-orm';

import { buildPaginationMeta } from '../../contracts/pagination.js';
import type { ProjectBriefHistoryRecord, SaveProjectBriefHistoryInput } from '../../application/models/project-brief.models.js';
import { ProjectBriefHistoryRepository } from '../../application/ports/projects/project-brief-history.repository.js';
import { PostgresDatabase } from '../persistence/database.js';
import { projectBriefHistory } from '../persistence/schema/index.js';

type Row = Record<string, unknown>;

function nowIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value || new Date().toISOString());
}

function projectBriefHistoryFromRow(row: Row): ProjectBriefHistoryRecord {
  return {
    id: String(row.id || ''),
    userId: String(row.user_id || ''),
    workspaceSlug: String(row.workspace_slug || ''),
    projectSlug: String(row.project_slug || ''),
    brief: row.brief as ProjectBriefHistoryRecord['brief'],
    sourceRefs: Array.isArray(row.source_refs) ? row.source_refs as ProjectBriefHistoryRecord['sourceRefs'] : [],
    contextHash: String(row.context_hash || ''),
    contextWindow: Number(row.context_window || 30),
    provider: String(row.provider || ''),
    model: String(row.model || ''),
    generatedAt: nowIso(row.generated_at),
    createdAt: nowIso(row.created_at),
  };
}

@Injectable()
export class PostgresProjectBriefHistoryRepository extends ProjectBriefHistoryRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async save(input: SaveProjectBriefHistoryInput) {
    const db = this.database.getDb();
    const result = await db
      .insert(projectBriefHistory)
      .values({
        id: crypto.randomUUID(),
        userId: input.userId,
        workspaceSlug: input.workspaceSlug,
        projectSlug: input.projectSlug,
        brief: input.brief,
        sourceRefs: input.sourceRefs,
        contextHash: input.contextHash,
        contextWindow: input.contextWindow,
        provider: input.provider,
        model: input.model,
        generatedAt: new Date(input.brief.generatedAt),
      })
      .returning();
    
    return projectBriefHistoryFromRow(result[0]);
  }

  async findLatest(input: { userId: string; workspaceSlug: string; projectSlug: string }) {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(projectBriefHistory)
      .where(and(
        eq(projectBriefHistory.userId, input.userId),
        eq(projectBriefHistory.workspaceSlug, input.workspaceSlug),
        eq(projectBriefHistory.projectSlug, input.projectSlug)
      ))
      .orderBy(desc(projectBriefHistory.generatedAt))
      .limit(1);
    
    return result[0] ? projectBriefHistoryFromRow(result[0]) : null;
  }

  async list(input: {
    userId: string;
    workspaceSlug: string;
    projectSlug: string;
    page: number;
    pageSize: number;
  }) {
    const db = this.database.getDb();
    const whereCondition = and(
      eq(projectBriefHistory.userId, input.userId),
      eq(projectBriefHistory.workspaceSlug, input.workspaceSlug),
      eq(projectBriefHistory.projectSlug, input.projectSlug)
    );

    const countResult = await db
      .select({ total: count() })
      .from(projectBriefHistory)
      .where(whereCondition);
    
    const total = Number(countResult[0]?.total || 0);
    const pagination = buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, total);
    const offset = (pagination.page - 1) * pagination.pageSize;

    const result = await db
      .select()
      .from(projectBriefHistory)
      .where(whereCondition)
      .orderBy(desc(projectBriefHistory.generatedAt), desc(projectBriefHistory.id))
      .limit(pagination.pageSize)
      .offset(offset);

    return {
      items: result.map(projectBriefHistoryFromRow),
      pagination,
    };
  }
}
