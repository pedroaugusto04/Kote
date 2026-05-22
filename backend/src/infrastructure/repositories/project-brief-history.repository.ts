import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { ProjectBriefHistoryRecord, SaveProjectBriefHistoryInput } from '../../application/models/project-brief.models.js';
import { ProjectBriefHistoryRepository } from '../../application/ports/project-brief-history.repository.js';
import { PostgresDatabase } from '../persistence/database.js';

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
    const result = await this.database.getPool().query(
      `insert into kb_project_brief_history (
         id, user_id, workspace_slug, project_slug, brief, source_refs, context_hash,
         context_window, provider, model, generated_at
       )
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11::timestamptz)
       returning *`,
      [
        crypto.randomUUID(),
        input.userId,
        input.workspaceSlug,
        input.projectSlug,
        JSON.stringify(input.brief),
        JSON.stringify(input.sourceRefs),
        input.contextHash,
        input.contextWindow,
        input.provider,
        input.model,
        input.brief.generatedAt,
      ],
    );
    return projectBriefHistoryFromRow(result.rows[0]);
  }

  async findLatest(input: { userId: string; workspaceSlug: string; projectSlug: string }) {
    const result = await this.database.getPool().query(
      `select * from kb_project_brief_history
       where user_id = $1 and workspace_slug = $2 and project_slug = $3
       order by generated_at desc
       limit 1`,
      [input.userId, input.workspaceSlug, input.projectSlug],
    );
    return result.rows[0] ? projectBriefHistoryFromRow(result.rows[0]) : null;
  }
}
