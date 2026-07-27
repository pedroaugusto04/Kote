import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { schedule } from 'node-cron';
import { PostgresDatabase } from '../../infrastructure/persistence/database.js';
import { AppLogger } from '../../observability/logger.js';
import { eq, and, lt, sql } from 'drizzle-orm';
import { AUTO_ACTION_NONE } from '../../domain/auto-action.constants.js';

const AUTO_ACTION_CRON = process.env.AUTO_ACTION_CRON ?? '0 */1 * * *'; // every hour by default
const AUTO_ACTION_TIMEZONE = process.env.AUTO_ACTION_TIMEZONE ?? 'UTC';

@Injectable()
export class AutoActionWorker implements OnModuleInit, OnModuleDestroy {
  private cronTask: any;

  constructor(
    private readonly database: PostgresDatabase,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit() {
    this.startAutoActionWorker();
  }

  onModuleDestroy() {
    if (this.cronTask) this.cronTask.stop();
  }

  startAutoActionWorker() {
    this.logger.info('[worker] auto-action batch worker starting');
    this.logger.info(`[worker] AUTO_ACTION_CRON=${AUTO_ACTION_CRON}`);

    this.cronTask = schedule(
      AUTO_ACTION_CRON,
      async () => {
        await this.runAutoActionJob();
      },
      { timezone: AUTO_ACTION_TIMEZONE }
    );
  }

  private async runAutoActionJob() {
    this.logger.info('[worker] running auto-action batch job');
    const pool = this.database.getPool();

    try {
      const res = await pool.query(
        `update kb_notes n
           set status = g.action::note_status_enum, updated_at = now()
           from kb_auto_action_global g
           where g.enabled = true
             and g.action <> 'none'
             and g.after_hours is not null
             and n.user_id = g.user_id
             and n.status = 'active'
             and n.created_at <= now() - (g.after_hours * interval '1 hour')
           returning n.id, n.user_id`
      );

      const total = Number(res.rowCount ?? 0);
      if (total === 0) {
        this.logger.info('[worker] no notes eligible for auto-action');
        return;
      }

      // aggregate counts per user for logging
      const perUser: Record<string, number> = {};
      for (const r of res.rows) {
        const uid = String(r.user_id);
        perUser[uid] = (perUser[uid] || 0) + 1;
      }

      this.logger.info(`[worker] applied auto-action to ${total} notes across ${Object.keys(perUser).length} users`);
      for (const [uid, count] of Object.entries(perUser)) {
        this.logger.info(`[worker] applied auto-action to ${count} notes for user=${uid}`);
      }
    } catch (err) {
      this.logger.error('[worker] auto-action job failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
