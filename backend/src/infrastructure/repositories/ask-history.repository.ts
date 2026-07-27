import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { eq, and, desc, count, gte, lte, sql } from 'drizzle-orm';

import { buildPaginationMeta, type PaginatedResult } from '../../contracts/pagination.js';
import { ConversationConfidence } from '../../contracts/enums.js';
import type {
  AskHistoryItem,
  AskHistoryRelatedNote,
  AskHistorySource,
  ListAskHistoryInput,
  SaveAskHistoryInput,
  AskConversationSummary,
} from '../../application/models/ask-history.models.js';
import { AskHistoryRepository } from '../../application/ports/query/ask-history.repository.js';
import { PostgresDatabase } from '../persistence/database.js';
import { askHistory } from '../persistence/schema/index.js';

type Row = Record<string, unknown>;

function nowIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value || new Date().toISOString());
}

function askHistoryFromRow(row: Row): AskHistoryItem {
  const projectId = row.projectId;
  const relatedNotes = row.relatedNotes;
  const createdAt = row.createdAt;
  return {
    id: String(row.id || ''),
    conversationId: String(row.conversationId || ''),
    question: String(row.question || ''),
    answer: String(row.answer || ''),
    confidence: (row.confidence === 'high' || row.confidence === 'medium' ? row.confidence : 'low') as ConversationConfidence,
    projectId: projectId ? String(projectId) : null,
    sources: Array.isArray(row.sources) ? row.sources as AskHistorySource[] : [],
    relatedNotes: Array.isArray(relatedNotes) ? relatedNotes as AskHistoryRelatedNote[] : [],
    createdAt: nowIso(createdAt),
  };
}

@Injectable()
export class PostgresAskHistoryRepository extends AskHistoryRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async save(input: SaveAskHistoryInput) {
    const db = this.database.getDb();
    await db
      .insert(askHistory)
      .values({
        id: crypto.randomUUID(),
        userId: input.userId,
        projectId: input.projectId || null,
        workspaceId: input.workspaceId || null,
        conversationId: input.conversationId,
        question: input.question,
        answer: input.answer,
        confidence: input.confidence as ConversationConfidence,
        sources: input.sources,
        relatedNotes: input.relatedNotes,
      });
  }

  async list(input: ListAskHistoryInput) {
    const db = this.database.getDb();
    const conditions = [eq(askHistory.userId, input.userId)];

    if (input.projectId) {
      conditions.push(eq(askHistory.projectId, input.projectId));
    }

    if (input.startDate) {
      conditions.push(gte(askHistory.createdAt, new Date(input.startDate)));
    }

    if (input.endDate) {
      conditions.push(lte(askHistory.createdAt, new Date(input.endDate)));
    }

    const whereCondition = conditions.length > 1 ? and(...conditions) : conditions[0];
    
    const countResult = await db
      .select({ total: count() })
      .from(askHistory)
      .where(whereCondition);
    
    const total = Number(countResult[0]?.total || 0);
    const pagination = buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, total);
    const offset = (pagination.page - 1) * pagination.pageSize;

    const result = await db
      .select()
      .from(askHistory)
      .where(whereCondition)
      .orderBy(desc(askHistory.createdAt), desc(askHistory.id))
      .limit(pagination.pageSize)
      .offset(offset);

    return {
      items: result.map(askHistoryFromRow),
      pagination,
    };
  }

  async listConversations(input: { userId: string; projectId?: string; page: number; pageSize: number }): Promise<PaginatedResult<AskConversationSummary>> {
    const db = this.database.getDb();
    const conditions = [eq(askHistory.userId, input.userId)];

    if (input.projectId) {
      conditions.push(eq(askHistory.projectId, input.projectId));
    }

    const whereCondition = conditions.length > 1 ? and(...conditions) : conditions[0];

    // Count total unique conversations
    const countResult = await db
      .select({ count: sql<number>`count(distinct ${askHistory.conversationId})` })
      .from(askHistory)
      .where(whereCondition);

    const total = Number(countResult[0]?.count || 0);
    const pagination = buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, total);
    const offset = (pagination.page - 1) * pagination.pageSize;

    // Use window functions inside a subquery to select:
    // - first question as title (ordered by createdAt asc)
    // - max created_at for sorting (grouped/partitioned by conversationId)
    const cte = db
      .select({
        conversationId: askHistory.conversationId,
        question: askHistory.question,
        createdAt: askHistory.createdAt,
        projectId: askHistory.projectId,
        rowNum: sql<number>`row_number() over (partition by ${askHistory.conversationId} order by ${askHistory.createdAt} asc)`.as('row_num'),
        latestCreatedAt: sql<Date>`max(${askHistory.createdAt}) over (partition by ${askHistory.conversationId})`.as('latest_created_at'),
      })
      .from(askHistory)
      .where(whereCondition)
      .as('cte');

    const result = await db
      .select({
        conversationId: cte.conversationId,
        title: cte.question,
        projectId: cte.projectId,
        createdAt: cte.latestCreatedAt,
      })
      .from(cte)
      .where(eq(cte.rowNum, 1))
      .orderBy(desc(cte.latestCreatedAt))
      .limit(pagination.pageSize)
      .offset(offset);

    const items = result.map((row) => ({
      conversationId: String(row.conversationId),
      title: String(row.title),
      projectId: row.projectId ? String(row.projectId) : null,
      createdAt: nowIso(row.createdAt),
    }));

    return {
      items,
      pagination,
    };
  }

  async getConversationTurns(conversationId: string): Promise<AskHistoryItem[]> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(askHistory)
      .where(eq(askHistory.conversationId, conversationId))
      .orderBy(askHistory.createdAt);
    return result.map(askHistoryFromRow);
  }
}
