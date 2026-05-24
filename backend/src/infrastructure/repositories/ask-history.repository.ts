import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { buildPaginationMeta } from '../../contracts/pagination.js';
import type {
  AskHistoryItem,
  AskHistoryRelatedNote,
  AskHistorySource,
  ListAskHistoryInput,
  SaveAskHistoryInput,
} from '../../application/models/ask-history.models.js';
import { AskHistoryRepository } from '../../application/ports/query/ask-history.repository.js';
import { PostgresDatabase } from '../persistence/database.js';

type Row = Record<string, unknown>;

function nowIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value || new Date().toISOString());
}

function askHistoryFromRow(row: Row): AskHistoryItem {
  return {
    id: String(row.id || ''),
    question: String(row.question || ''),
    answer: String(row.answer || ''),
    confidence: row.confidence === 'high' || row.confidence === 'medium' ? row.confidence : 'low',
    projectSlug: String(row.project_slug || ''),
    sources: Array.isArray(row.sources) ? row.sources as AskHistorySource[] : [],
    relatedNotes: Array.isArray(row.related_notes) ? row.related_notes as AskHistoryRelatedNote[] : [],
    createdAt: nowIso(row.created_at),
  };
}

@Injectable()
export class PostgresAskHistoryRepository extends AskHistoryRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async save(input: SaveAskHistoryInput) {
    await this.database.getPool().query(
      `insert into kb_ask_history (
         id, user_id, project_slug, question, answer, confidence, sources, related_notes
       )
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
      [
        crypto.randomUUID(),
        input.userId,
        input.projectSlug,
        input.question,
        input.answer,
        input.confidence,
        JSON.stringify(input.sources),
        JSON.stringify(input.relatedNotes),
      ],
    );
  }

  async list(input: ListAskHistoryInput) {
    const where = ['user_id = $1'];
    const values: unknown[] = [input.userId];
    if (input.projectSlug) {
      values.push(input.projectSlug);
      where.push(`project_slug = $${values.length}`);
    }

    const countResult = await this.database.getPool().query(
      `select count(*)::int as total from kb_ask_history where ${where.join(' and ')}`,
      values,
    );
    const total = Number(countResult.rows[0]?.total || 0);
    const pagination = buildPaginationMeta({ page: input.page, pageSize: input.pageSize }, total);
    const offset = (pagination.page - 1) * pagination.pageSize;

    const result = await this.database.getPool().query(
      `select * from kb_ask_history
       where ${where.join(' and ')}
       order by created_at desc, id desc
       limit $${values.length + 1} offset $${values.length + 2}`,
      [...values, pagination.pageSize, offset],
    );

    return {
      items: result.rows.map(askHistoryFromRow),
      pagination,
    };
  }
}
