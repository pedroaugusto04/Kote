import { Injectable } from '@nestjs/common';
import { PostgresDatabase } from '../persistence/database.js';
import { NoteSynthesisRepository } from '../../application/ports/notes/note-synthesis.repository.js';
import type { NoteSynthesisRecord, NoteSynthesisItem } from '../../application/models/note-synthesis.models.js';
import { NoteSynthesisStatus } from '../../application/constants/ai-session-synthesis.constants.js';

function map(row: Record<string, unknown>): NoteSynthesisRecord {
  return {
    id: String(row.id), userId: String(row.user_id), noteId: String(row.note_id),
    status: String(row.status) as NoteSynthesisRecord['status'], mode: String(row.mode) as NoteSynthesisRecord['mode'],
    overview: String(row.overview || ''), memory: (Array.isArray(row.memory) ? row.memory : []) as NoteSynthesisItem[],
    sourceHash: String(row.source_hash || ''), provider: String(row.provider || ''), model: String(row.model || ''),
    errorCode: row.error_code ? String(row.error_code) : null,
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
    const result = await this.database.getPool().query('SELECT * FROM kb_note_syntheses WHERE user_id=$1 AND note_id=$2', [userId,noteId]);
    return result.rows[0] ? map(result.rows[0]) : null;
  }
}
