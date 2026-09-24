import { Injectable } from '@nestjs/common';
import { PostgresDatabase } from '../persistence/database.js';
import { NoteSynthesisRepository } from '../../application/ports/notes/note-synthesis.repository.js';
import type { NoteSynthesisRecord, NoteSynthesisItem } from '../../application/models/note-synthesis.models.js';
import type { ListProjectDecisionsInput, ListProjectDecisionsResult, ProjectDecisionItem } from '../../application/models/project-decisions.models.js';
import { NoteSynthesisStatus } from '../../application/constants/ai-session-synthesis.constants.js';

function map(row: Record<string, unknown>): NoteSynthesisRecord {
  return {
    id: String(row.id), userId: String(row.user_id), noteId: String(row.note_id),
    status: String(row.status) as NoteSynthesisRecord['status'], mode: String(row.mode) as NoteSynthesisRecord['mode'],
    overview: String(row.overview || ''), memory: (Array.isArray(row.memory) ? row.memory : []) as NoteSynthesisItem[],
    sourceHash: String(row.source_hash || ''), provider: String(row.provider || ''), model: String(row.model || ''),
    errorCode: row.error_code ? String(row.error_code) : null,
    availableAt: row.available_at ? new Date(String(row.available_at)).toISOString() : null,
    generatedAt: row.generated_at ? new Date(String(row.generated_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

@Injectable()
export class PostgresNoteSynthesisRepository extends NoteSynthesisRepository {
  constructor(private readonly database: PostgresDatabase) { super(); }

  async upsertPending(input: { userId: string; noteId: string; sourceHash: string; mode?: 'ai' | 'deterministic'; force?: boolean }, tx?: any) {
    if (tx?.execute) {
      const { sql } = await import('drizzle-orm');
      const result: any = await tx.execute(sql`INSERT INTO kb_note_syntheses (user_id,note_id,source_hash,mode,status)
       VALUES (${input.userId},${input.noteId},${input.sourceHash},${input.mode || 'ai'},${NoteSynthesisStatus.Pending})
       ON CONFLICT (note_id) DO UPDATE SET source_hash=EXCLUDED.source_hash, mode=EXCLUDED.mode,
         status=CASE WHEN ${Boolean(input.force)} THEN ${NoteSynthesisStatus.Pending} WHEN kb_note_syntheses.source_hash = EXCLUDED.source_hash THEN kb_note_syntheses.status ELSE ${NoteSynthesisStatus.Pending} END,
         overview=CASE WHEN ${Boolean(input.force)} OR kb_note_syntheses.source_hash <> EXCLUDED.source_hash THEN '' ELSE kb_note_syntheses.overview END,
         memory=CASE WHEN ${Boolean(input.force)} OR kb_note_syntheses.source_hash <> EXCLUDED.source_hash THEN '[]'::jsonb ELSE kb_note_syntheses.memory END,
         error_code=NULL, updated_at=now() RETURNING *`);
      return map(result.rows[0]);
    }
    const result = await this.database.getPool().query(
      `INSERT INTO kb_note_syntheses (user_id,note_id,source_hash,mode,status)
       VALUES ($1,$2,$3,$4,'${NoteSynthesisStatus.Pending}')
       ON CONFLICT (note_id) DO UPDATE SET source_hash=EXCLUDED.source_hash, mode=EXCLUDED.mode,
         status=CASE WHEN $5::boolean THEN '${NoteSynthesisStatus.Pending}' WHEN kb_note_syntheses.source_hash = EXCLUDED.source_hash THEN kb_note_syntheses.status ELSE '${NoteSynthesisStatus.Pending}' END,
         overview=CASE WHEN $5::boolean OR kb_note_syntheses.source_hash <> EXCLUDED.source_hash THEN '' ELSE kb_note_syntheses.overview END,
         memory=CASE WHEN $5::boolean OR kb_note_syntheses.source_hash <> EXCLUDED.source_hash THEN '[]'::jsonb ELSE kb_note_syntheses.memory END,
         error_code=NULL, updated_at=now()
       RETURNING *`, [input.userId, input.noteId, input.sourceHash, input.mode || 'ai', Boolean(input.force)]);
    return map(result.rows[0]);
  }

  async markProcessing(userId: string, noteId: string, sourceHash: string) {
    await this.database.getPool().query(
      `UPDATE kb_note_syntheses SET status='${NoteSynthesisStatus.Processing}',updated_at=now()
       WHERE user_id=$1 AND note_id=$2 AND source_hash=$3 AND status='${NoteSynthesisStatus.Pending}'`,
      [userId, noteId, sourceHash],
    );
  }

  async markCompleted(input: { userId: string; noteId: string; sourceHash: string; mode: 'ai' | 'deterministic'; overview: string; memory: NoteSynthesisItem[]; provider: string; model: string }) {
    const result = await this.database.getPool().query(
      `UPDATE kb_note_syntheses SET mode=$4,status='${NoteSynthesisStatus.Completed}',overview=$5,memory=$6::jsonb,provider=$7,model=$8,error_code=NULL,generated_at=now(),updated_at=now()
       WHERE user_id=$1 AND note_id=$2 AND source_hash=$3 RETURNING *`, [input.userId,input.noteId,input.sourceHash,input.mode,input.overview,JSON.stringify(input.memory),input.provider,input.model]);
    // A superseded job must not recreate or overwrite the newest pending synthesis.
    return result.rows[0] ? map(result.rows[0]) : (await this.getByNoteId(input.userId, input.noteId))!;
  }

  async markFailed(userId: string, noteId: string, sourceHash: string, errorCode: string) {
    await this.database.getPool().query(`UPDATE kb_note_syntheses SET status='${NoteSynthesisStatus.Failed}',error_code=$4,updated_at=now() WHERE user_id=$1 AND note_id=$2 AND source_hash=$3`, [userId,noteId,sourceHash,errorCode]);
  }

  async markSkipped(userId: string, noteId: string, sourceHash: string, errorCode: string) {
    await this.database.getPool().query(`UPDATE kb_note_syntheses SET status='${NoteSynthesisStatus.Skipped}',error_code=$4,updated_at=now() WHERE user_id=$1 AND note_id=$2 AND source_hash=$3`, [userId,noteId,sourceHash,errorCode]);
  }

  async getByNoteId(userId: string, noteId: string) {
    const result = await this.database.getPool().query(
      `SELECT s.*, o.available_at
       FROM kb_note_syntheses s
       LEFT JOIN kb_ai_session_synthesis_outbox o
         ON o.note_id = s.note_id AND o.source_hash = s.source_hash
       WHERE s.user_id = $1 AND s.note_id = $2`,
      [userId, noteId],
    );
    return result.rows[0] ? map(result.rows[0]) : null;
  }

  async listProjectDecisions(userId: string, input: ListProjectDecisionsInput): Promise<ListProjectDecisionsResult> {
    const page = Math.max(1, input.page || 1);
    const pageSize = Math.min(100, Math.max(1, input.pageSize || 20));
    const offset = (page - 1) * pageSize;

    const queryParams: any[] = [userId, input.projectSlug];
    const whereClauses: string[] = [
      's.user_id = $1',
      'p.project_slug = $2',
      `s.status = '${NoteSynthesisStatus.Completed}'`,
    ];

    if (input.kind && input.kind !== 'all') {
      queryParams.push(input.kind);
      whereClauses.push(`(item_val->>'kind') = $${queryParams.length}`);
    } else {
      whereClauses.push(`(item_val->>'kind') IN ('decision', 'failed_attempt')`);
    }

    if (input.status && input.status !== 'all') {
      queryParams.push(input.status);
      whereClauses.push(`(item_val->>'status') = $${queryParams.length}`);
    }

    if (input.file) {
      queryParams.push(JSON.stringify([input.file]));
      whereClauses.push(`(item_val->'files') @> $${queryParams.length}::jsonb`);
    }

    if (input.search && input.search.trim()) {
      queryParams.push(`%${input.search.trim()}%`);
      whereClauses.push(`(item_val->>'text') ILIKE $${queryParams.length}`);
    }

    const whereSql = whereClauses.join(' AND ');

    const dataQuery = `
      WITH all_items AS (
        SELECT 
          s.note_id,
          s.generated_at,
          s.provider,
          s.model,
          n.title as note_title,
          n.path as note_path,
          n.source_channel,
          n.source,
          coalesce(n.occurred_at, n.created_at) as occurred_at,
          p.project_slug,
          item.ordinality as item_index,
          item_val->>'kind' as kind,
          item_val->>'text' as text,
          item_val->>'status' as status,
          coalesce(item_val->'turnRefs', '[]'::jsonb) as turn_refs,
          coalesce(item_val->'files', '[]'::jsonb) as files,
          coalesce(item_val->'entities', '[]'::jsonb) as entities
        FROM kb_note_syntheses s
        JOIN kb_notes n ON n.id = s.note_id
        JOIN kb_projects p ON p.id = n.project_id
        CROSS JOIN LATERAL jsonb_array_elements(s.memory) WITH ORDINALITY AS item(item_val, ordinality)
        WHERE ${whereSql}
      )
      SELECT *, count(*) OVER() as total_count
      FROM all_items
      ORDER BY occurred_at DESC, item_index ASC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    queryParams.push(pageSize, offset);

    const filesQuery = `
      SELECT DISTINCT jsonb_array_elements_text(item_val->'files') as file_path
      FROM kb_note_syntheses s
      JOIN kb_notes n ON n.id = s.note_id
      JOIN kb_projects p ON p.id = n.project_id
      CROSS JOIN LATERAL jsonb_array_elements(s.memory) as item(item_val)
      WHERE s.user_id = $1 
        AND p.project_slug = $2 
        AND s.status = '${NoteSynthesisStatus.Completed}'
        AND (item_val->>'kind') IN ('decision', 'failed_attempt')
        AND jsonb_array_length(coalesce(item_val->'files', '[]'::jsonb)) > 0
      ORDER BY file_path ASC
      LIMIT 100
    `;

    const [dataResult, filesResult] = await Promise.all([
      this.database.getPool().query(dataQuery, queryParams),
      this.database.getPool().query(filesQuery, [userId, input.projectSlug]),
    ]);

    const total = dataResult.rows.length > 0 ? Number(dataResult.rows[0].total_count) : 0;
    const totalPages = Math.ceil(total / pageSize) || 1;

    const items: ProjectDecisionItem[] = dataResult.rows.map((row: any) => ({
      id: `${row.note_id}-${row.item_index}`,
      noteId: String(row.note_id),
      noteTitle: String(row.note_title || ''),
      notePath: String(row.note_path || ''),
      projectSlug: String(row.project_slug || ''),
      sourceChannel: String(row.source_channel || ''),
      source: row.source ? String(row.source) : undefined,
      occurredAt: new Date(String(row.occurred_at)).toISOString(),
      generatedAt: row.generated_at ? new Date(String(row.generated_at)).toISOString() : null,
      kind: row.kind as ProjectDecisionItem['kind'],
      text: String(row.text || ''),
      status: String(row.status || 'unknown') as ProjectDecisionItem['status'],
      turnRefs: Array.isArray(row.turn_refs) ? row.turn_refs : [],
      files: Array.isArray(row.files) ? row.files : [],
      entities: Array.isArray(row.entities) ? row.entities : [],
      provider: row.provider ? String(row.provider) : undefined,
      model: row.model ? String(row.model) : undefined,
    }));

    const availableFiles = filesResult.rows.map((r: any) => String(r.file_path)).filter(Boolean);

    return {
      items,
      availableFiles,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }
}
