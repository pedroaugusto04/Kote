import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { eq, and, desc, count } from 'drizzle-orm';

import { buildPaginationMeta } from '../../contracts/pagination.js';
import type { ProjectBriefHistoryRecord, SaveProjectBriefHistoryInput } from '../../application/models/project-brief.models.js';
import { ProjectBriefHistoryRepository } from '../../application/ports/projects/project-brief-history.repository.js';
import { PostgresDatabase } from '../persistence/database.js';
import { projectBriefHistory, projects, workspaces } from '../persistence/schema/index.js';

type Row = Record<string, unknown>;

function nowIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value || new Date().toISOString());
}

function projectBriefHistoryFromRow(row: Row): ProjectBriefHistoryRecord {
  return {
    id: String(row.id || ''),
    userId: String(row.userId ?? ''),
    projectId: row.projectId ? String(row.projectId) : undefined,
    workspaceSlug: String(row.workspaceSlug ?? ''),
    projectSlug: String(row.projectSlug ?? ''),
    brief: row.brief as ProjectBriefHistoryRecord['brief'],
    sourceRefs: Array.isArray(row.sourceRefs)
      ? row.sourceRefs as ProjectBriefHistoryRecord['sourceRefs']
      : Array.isArray(row.source_refs)
      ? row.source_refs as ProjectBriefHistoryRecord['sourceRefs']
      : [],
    contextHash: String(row.contextHash ?? ''),
    contextWindow: Number(row.contextWindow ?? 30),
    provider: String(row.provider || ''),
    model: String(row.model || ''),
    generatedAt: nowIso(row.generatedAt),
    createdAt: nowIso(row.createdAt),
  };
}

@Injectable()
export class PostgresProjectBriefHistoryRepository extends ProjectBriefHistoryRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  private async resolveProjectId(userId: string, workspaceSlug: string, projectSlug: string): Promise<string | null> {
    if (projectSlug === 'all') {
      return null;
    }

    const db = this.database.getDb();
    const result = await db
      .select({ id: projects.id })
      .from(projects)
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .where(and(
        eq(projects.userId, userId),
        eq(workspaces.workspaceSlug, workspaceSlug),
        eq(projects.projectSlug, projectSlug)
      ))
      .limit(1);

    if (result.length === 0) {
      throw new Error(`Project not found for slug: ${projectSlug} in workspace: ${workspaceSlug}`);
    }
    return result[0].id;
  }

  async save(input: SaveProjectBriefHistoryInput) {
    const db = this.database.getDb();
    const projectId = input.projectId !== undefined
      ? input.projectId
      : await this.resolveProjectId(input.userId, input.workspaceSlug, input.projectSlug);
    const result = await db
      .insert(projectBriefHistory)
      .values({
        id: crypto.randomUUID(),
        userId: input.userId,
        projectId,
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

  async findLatest(input: { userId: string; workspaceSlug: string; projectSlug: string; projectId?: string }) {
    const db = this.database.getDb();
    
    const conditions = [
      eq(projectBriefHistory.userId, input.userId),
    ];
    if (input.projectId && input.projectId !== 'all') {
      conditions.push(eq(projectBriefHistory.projectId, input.projectId));
    } else {
      conditions.push(eq(projectBriefHistory.workspaceSlug, input.workspaceSlug));
      conditions.push(eq(projectBriefHistory.projectSlug, input.projectSlug));
    }

    const result = await db
      .select({
        id: projectBriefHistory.id,
        userId: projectBriefHistory.userId,
        projectId: projectBriefHistory.projectId,
        workspaceSlug: projectBriefHistory.workspaceSlug,
        projectSlug: projectBriefHistory.projectSlug,
        brief: projectBriefHistory.brief,
        sourceRefs: projectBriefHistory.sourceRefs,
        contextHash: projectBriefHistory.contextHash,
        contextWindow: projectBriefHistory.contextWindow,
        provider: projectBriefHistory.provider,
        model: projectBriefHistory.model,
        generatedAt: projectBriefHistory.generatedAt,
        createdAt: projectBriefHistory.createdAt,
      })
      .from(projectBriefHistory)
      .where(and(...conditions))
      .orderBy(desc(projectBriefHistory.generatedAt))
      .limit(1);
    
    return result[0] ? projectBriefHistoryFromRow(result[0]) : null;
  }

  async list(input: {
    userId: string;
    workspaceSlug: string;
    projectSlug: string;
    projectId?: string;
    page: number;
    pageSize: number;
  }) {
    const db = this.database.getDb();
    const conditions = [
      eq(projectBriefHistory.userId, input.userId),
    ];
    if (input.projectId && input.projectId !== 'all') {
      conditions.push(eq(projectBriefHistory.projectId, input.projectId));
    } else {
      conditions.push(eq(projectBriefHistory.workspaceSlug, input.workspaceSlug));
      conditions.push(eq(projectBriefHistory.projectSlug, input.projectSlug));
    }

    const countResult = await db
      .select({ total: count() })
      .from(projectBriefHistory)
      .where(and(...conditions));
    
    const total = Number(countResult[0]?.total || 0);
    const pagination = buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, total);
    const offset = (pagination.page - 1) * pagination.pageSize;

    const result = await db
      .select({
        id: projectBriefHistory.id,
        userId: projectBriefHistory.userId,
        projectId: projectBriefHistory.projectId,
        workspaceSlug: projectBriefHistory.workspaceSlug,
        projectSlug: projectBriefHistory.projectSlug,
        brief: projectBriefHistory.brief,
        sourceRefs: projectBriefHistory.sourceRefs,
        contextHash: projectBriefHistory.contextHash,
        contextWindow: projectBriefHistory.contextWindow,
        provider: projectBriefHistory.provider,
        model: projectBriefHistory.model,
        generatedAt: projectBriefHistory.generatedAt,
        createdAt: projectBriefHistory.createdAt,
      })
      .from(projectBriefHistory)
      .where(and(...conditions))
      .orderBy(desc(projectBriefHistory.generatedAt), desc(projectBriefHistory.id))
      .limit(pagination.pageSize)
      .offset(offset);

    return {
      items: result.map(projectBriefHistoryFromRow),
      pagination,
    };
  }

  async countByUser(userId: string): Promise<number> {
    const db = this.database.getDb();
    const result = await db
      .select({ total: count() })
      .from(projectBriefHistory)
      .where(eq(projectBriefHistory.userId, userId));
    
    return Number(result[0]?.total || 0);
  }
}
