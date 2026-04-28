import { Injectable } from '@nestjs/common';

import { ConversationStateRepository, ReminderDispatchRepository } from '../../application/ports/workflow-state.repository.js';
import type { ReminderDispatchMode } from '../../contracts/enums.js';
import { conversationStateFromRow } from './row.mappers.js';
import { PostgresDatabase } from './database.js';

@Injectable()
export class PostgresWorkflowStateRepository extends ConversationStateRepository implements ReminderDispatchRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async get(userId: string, workspaceSlug: string, conversationKey: string) {
    const result = await this.database.getPool().query(
      'select * from kb_conversation_states where user_id = $1 and workspace_slug = $2 and conversation_key = $3 limit 1',
      [userId, workspaceSlug, conversationKey],
    );
    return result.rows[0] ? conversationStateFromRow(result.rows[0]) : null;
  }

  async upsert(userId: string, workspaceSlug: string, conversationKey: string, state: unknown) {
    const result = await this.database.getPool().query(
      `insert into kb_conversation_states (user_id, workspace_slug, conversation_key, state)
       values ($1, $2, $3, $4::jsonb)
       on conflict (user_id, workspace_slug, conversation_key)
       do update set state = excluded.state, updated_at = now()
       returning *`,
      [userId, workspaceSlug, conversationKey, JSON.stringify(state || {})],
    );
    return conversationStateFromRow(result.rows[0]);
  }

  async clear(userId: string, workspaceSlug: string, conversationKey: string) {
    await this.database.getPool().query('delete from kb_conversation_states where user_id = $1 and workspace_slug = $2 and conversation_key = $3', [
      userId,
      workspaceSlug,
      conversationKey,
    ]);
  }

  async hasSent(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string) {
    const result = await this.database.getPool().query(
      `select 1 from kb_reminder_dispatch_state
       where user_id = $1 and workspace_slug = $2 and mode = $3 and dispatch_key = $4 and reminder_id = $5
       limit 1`,
      [userId, workspaceSlug, mode, dispatchKey, reminderId],
    );
    return Boolean(result.rows[0]);
  }

  async markSent(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string) {
    await this.database.getPool().query(
      `insert into kb_reminder_dispatch_state (user_id, workspace_slug, mode, dispatch_key, reminder_id)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, workspace_slug, mode, dispatch_key, reminder_id) do nothing`,
      [userId, workspaceSlug, mode, dispatchKey, reminderId],
    );
  }
}
