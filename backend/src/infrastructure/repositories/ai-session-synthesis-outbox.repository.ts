import { Injectable } from '@nestjs/common';
import { PostgresDatabase } from '../persistence/database.js';
import { AiSessionSynthesisOutboxRepository } from '../../application/ports/notes/ai-session-synthesis-outbox.repository.js';
import type { AiSessionSynthesisJob } from '../../application/models/note-processing.models.js';
import { AiSessionSynthesisJobStatus, type AiSessionSynthesisTerminalJobStatus } from '../../application/constants/ai-session-synthesis.constants.js';

function map(row: Record<string, unknown>): AiSessionSynthesisJob {
  return { id: String(row.id), noteId: String(row.note_id), userId: String(row.user_id), workspaceSlug: String(row.workspace_slug), sourceHash: String(row.source_hash), status: String(row.status) as AiSessionSynthesisJob['status'], attempts: Number(row.attempts), availableAt: new Date(String(row.available_at)).toISOString(), leaseUntil: row.lease_until ? new Date(String(row.lease_until)).toISOString() : null, publishedAt: row.published_at ? new Date(String(row.published_at)).toISOString() : null, chargedAt: row.charged_at ? new Date(String(row.charged_at)).toISOString() : null, errorCode: row.error_code ? String(row.error_code) : null };
}

@Injectable()
export class PostgresAiSessionSynthesisOutboxRepository extends AiSessionSynthesisOutboxRepository {
  constructor(private readonly database: PostgresDatabase) { super(); }

  async enqueue(input: { noteId: string; userId: string; workspaceSlug: string; sourceHash: string; availableAt?: Date; force?: boolean }, tx?: any) {
    const availableAt = input.availableAt || new Date();
    const force = Boolean(input.force);
    // Drizzle transactions expose execute(), while normal operation uses pg's pool.
    // Keeping this branch here makes the note, pending synthesis and outbox one unit.
    if (tx?.execute) {
      const { sql } = await import('drizzle-orm');
      const result: any = await tx.execute(sql`INSERT INTO kb_ai_session_synthesis_outbox (note_id,user_id,workspace_slug,source_hash,available_at)
        VALUES (${input.noteId},${input.userId},${input.workspaceSlug},${input.sourceHash},${availableAt})
        ON CONFLICT (note_id,source_hash,job_type) DO UPDATE SET
          status=CASE WHEN ${force} THEN ${AiSessionSynthesisJobStatus.Pending} WHEN kb_ai_session_synthesis_outbox.status IN (${AiSessionSynthesisJobStatus.Completed},${AiSessionSynthesisJobStatus.Failed},${AiSessionSynthesisJobStatus.Skipped},${AiSessionSynthesisJobStatus.Superseded}) THEN kb_ai_session_synthesis_outbox.status ELSE ${AiSessionSynthesisJobStatus.Pending} END,
          available_at=CASE WHEN ${force} THEN EXCLUDED.available_at WHEN kb_ai_session_synthesis_outbox.status IN (${AiSessionSynthesisJobStatus.Completed},${AiSessionSynthesisJobStatus.Failed},${AiSessionSynthesisJobStatus.Skipped},${AiSessionSynthesisJobStatus.Superseded}) THEN kb_ai_session_synthesis_outbox.available_at ELSE EXCLUDED.available_at END,
          lease_until=NULL,error_code=NULL,charged_at=CASE WHEN ${force} THEN NULL ELSE kb_ai_session_synthesis_outbox.charged_at END,updated_at=now()
        RETURNING *`);
      return map(result.rows[0]);
    }
    const result = await this.database.getPool().query(
      `INSERT INTO kb_ai_session_synthesis_outbox (note_id,user_id,workspace_slug,source_hash,available_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (note_id,source_hash,job_type) DO UPDATE SET
         status=CASE WHEN $6::boolean THEN '${AiSessionSynthesisJobStatus.Pending}' WHEN kb_ai_session_synthesis_outbox.status IN ('${AiSessionSynthesisJobStatus.Completed}','${AiSessionSynthesisJobStatus.Failed}','${AiSessionSynthesisJobStatus.Skipped}','${AiSessionSynthesisJobStatus.Superseded}') THEN kb_ai_session_synthesis_outbox.status ELSE '${AiSessionSynthesisJobStatus.Pending}' END,
         available_at=CASE WHEN $6::boolean THEN EXCLUDED.available_at WHEN kb_ai_session_synthesis_outbox.status IN ('${AiSessionSynthesisJobStatus.Completed}','${AiSessionSynthesisJobStatus.Failed}','${AiSessionSynthesisJobStatus.Skipped}','${AiSessionSynthesisJobStatus.Superseded}') THEN kb_ai_session_synthesis_outbox.available_at ELSE EXCLUDED.available_at END,
         lease_until=NULL,error_code=NULL,charged_at=CASE WHEN $6::boolean THEN NULL ELSE kb_ai_session_synthesis_outbox.charged_at END,updated_at=now()
       RETURNING *`, [input.noteId, input.userId, input.workspaceSlug, input.sourceHash, availableAt, force]);
    return map(result.rows[0]);
  }

  async listReadyForPublish(limit = 50) {
    const result = await this.database.getPool().query(
      `SELECT * FROM kb_ai_session_synthesis_outbox
       WHERE (status='${AiSessionSynthesisJobStatus.Pending}' AND available_at <= now()) OR (status IN ('${AiSessionSynthesisJobStatus.Published}','${AiSessionSynthesisJobStatus.Processing}') AND lease_until < now())
       ORDER BY available_at ASC LIMIT $1`, [limit]);
    return result.rows.map(map);
  }

  async markPublished(id: string) {
    await this.database.getPool().query(`UPDATE kb_ai_session_synthesis_outbox SET status='${AiSessionSynthesisJobStatus.Published}',published_at=now(),lease_until=now() + interval '10 minutes',updated_at=now() WHERE id=$1 AND status IN ('${AiSessionSynthesisJobStatus.Pending}','${AiSessionSynthesisJobStatus.Published}','${AiSessionSynthesisJobStatus.Processing}')`, [id]);
  }

  async claim(id: string, leaseMs: number) {
    const result = await this.database.getPool().query(
      `UPDATE kb_ai_session_synthesis_outbox SET status='${AiSessionSynthesisJobStatus.Processing}',attempts=attempts+1,lease_until=now() + ($2 * interval '1 millisecond'),updated_at=now()
       WHERE id=$1 AND status IN ('${AiSessionSynthesisJobStatus.Pending}','${AiSessionSynthesisJobStatus.Published}') AND available_at <= now() RETURNING *`, [id, leaseMs]);
    return result.rows[0] ? map(result.rows[0]) : null;
  }

  async complete(id: string, status: AiSessionSynthesisTerminalJobStatus, errorCode?: string) {
    await this.database.getPool().query(`UPDATE kb_ai_session_synthesis_outbox SET status=$2,error_code=$3,lease_until=NULL,updated_at=now() WHERE id=$1`, [id, status, errorCode || null]);
  }

  async retry(id: string, delayMs: number, errorCode: string) {
    await this.database.getPool().query(`UPDATE kb_ai_session_synthesis_outbox SET status='${AiSessionSynthesisJobStatus.Pending}',available_at=now() + ($2 * interval '1 millisecond'),error_code=$3,lease_until=NULL,updated_at=now() WHERE id=$1`, [id, delayMs, errorCode]);
  }

  async markCharged(id: string) {
    const result = await this.database.getPool().query(`UPDATE kb_ai_session_synthesis_outbox SET charged_at=now(),updated_at=now() WHERE id=$1 AND charged_at IS NULL RETURNING id`, [id]);
    return result.rowCount === 1;
  }
}
