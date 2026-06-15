import crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { SaveWorkspaceInput } from '../../application/models/repository-records.models.js';
import { workspaceFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';

@Injectable()
export class PostgresWorkspaceRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async list(userId: string) {
    const result = await this.database.getPool().query(
      'select * from kb_workspaces where user_id = $1 order by workspace_slug',
      [userId]
    );
    return result.rows.map(workspaceFromRow);
  }

  async upsert(userId: string, input: SaveWorkspaceInput) {
    const result = await this.database.getPool().query(
      `insert into kb_workspaces (id, user_id, workspace_slug, display_name, whatsapp_chat_jid, telegram_chat_id)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, workspace_slug)
       do update set
         display_name = excluded.display_name,
         whatsapp_chat_jid = excluded.whatsapp_chat_jid,
         telegram_chat_id = excluded.telegram_chat_id,
         updated_at = now()
       returning *`,
      [
        crypto.randomUUID(),
        userId,
        input.workspaceSlug,
        input.displayName,
        input.whatsappChatJid,
        input.telegramChatId,
      ]
    );
    return workspaceFromRow(result.rows[0]);
  }
}
