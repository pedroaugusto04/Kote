import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { eq, and, desc, count, gte, lte } from 'drizzle-orm';

import { buildPaginationMeta } from '../../contracts/pagination.js';
import { ConversationConfidence } from '../../contracts/enums.js';
import type {
  AskHistoryItem,
  AskHistoryRelatedNote,
  AskHistorySource,
  ListAskHistoryInput,
  SaveAskHistoryInput,
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
        question: input.question,
        answer: input.answer,
        confidence: input.confidence as any,
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
}
