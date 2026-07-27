import { Injectable } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';

import { ConversationStateRepository, ReminderDispatchRepository } from '../../application/ports/reminders/workflow-state.repository.js';
import { ReminderDispatchMode } from '../../contracts/enums.js';
import type { RecordReminderDispatchFailureInput, ReminderDispatchRetryKey } from '../../application/models/reminder-dispatch.models.js';
import { conversationStateFromRow } from '../mappers/row.mappers.js';
import { PostgresDatabase } from '../persistence/database.js';
import { conversationStates, reminderDispatchState, reminderDispatchFailures, workspaces } from '../persistence/schema/index.js';
import { resolveWorkspaceId } from './utils/id-resolution.helpers.js';

@Injectable()
export class PostgresWorkflowStateRepository extends ConversationStateRepository implements ReminderDispatchRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async get(userId: string, workspaceSlug: string, conversationKey: string) {
    const db = this.database.getDb();
    const workspaceId = await resolveWorkspaceId(this.database, userId, workspaceSlug);
    const result = await db
      .select()
      .from(conversationStates)
      .where(and(
        eq(conversationStates.userId, userId),
        eq(conversationStates.workspaceId, workspaceId),
        eq(conversationStates.conversationKey, conversationKey)
      ))
      .limit(1);
    
    return result[0] ? conversationStateFromRow({ ...result[0], workspaceSlug }) : null;
  }

  async upsert(userId: string, workspaceSlug: string, conversationKey: string, state: unknown) {
    const db = this.database.getDb();
    const workspaceId = await resolveWorkspaceId(this.database, userId, workspaceSlug);
    const result = await db
      .insert(conversationStates)
      .values({
        userId,
        workspaceId,
        conversationKey,
        state: state || {},
      })
      .onConflictDoUpdate({
        target: [conversationStates.userId, conversationStates.workspaceId, conversationStates.conversationKey],
        set: {
          state: state || {},
          updatedAt: new Date(),
        },
      })
      .returning();
    
    return conversationStateFromRow({ ...result[0], workspaceSlug });
  }

  async clear(userId: string, workspaceSlug: string, conversationKey: string) {
    const db = this.database.getDb();
    const workspaceId = await resolveWorkspaceId(this.database, userId, workspaceSlug);
    await db
      .delete(conversationStates)
      .where(and(
        eq(conversationStates.userId, userId),
        eq(conversationStates.workspaceId, workspaceId),
        eq(conversationStates.conversationKey, conversationKey)
      ));
  }

  async hasSent(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string) {
    const db = this.database.getDb();
    const workspaceId = await resolveWorkspaceId(this.database, userId, workspaceSlug);
    const result = await db
      .select()
      .from(reminderDispatchState)
      .where(and(
        eq(reminderDispatchState.userId, userId),
        eq(reminderDispatchState.workspaceId, workspaceId),
        eq(reminderDispatchState.mode, mode as ReminderDispatchMode),
        eq(reminderDispatchState.dispatchKey, dispatchKey),
        eq(reminderDispatchState.reminderId, reminderId)
      ))
      .limit(1);
    
    return Boolean(result[0]);
  }

  async markSent(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string) {
    const db = this.database.getDb();
    const workspaceId = await resolveWorkspaceId(this.database, userId, workspaceSlug);
    await db
      .insert(reminderDispatchState)
      .values({
        userId,
        workspaceId,
        mode: mode as ReminderDispatchMode,
        dispatchKey,
        reminderId,
      })
      .onConflictDoNothing();
  }

  async getRetryState(input: ReminderDispatchRetryKey) {
    const db = this.database.getDb();
    const workspaceId = await resolveWorkspaceId(this.database, input.userId, input.workspaceSlug);
    const result = await db
      .select({
        attemptCount: reminderDispatchFailures.attemptCount,
        nextRetryAt: reminderDispatchFailures.nextRetryAt,
        lastError: reminderDispatchFailures.lastError,
        updatedAt: reminderDispatchFailures.updatedAt,
      })
      .from(reminderDispatchFailures)
      .where(and(
        eq(reminderDispatchFailures.userId, input.userId),
        eq(reminderDispatchFailures.workspaceId, workspaceId),
        eq(reminderDispatchFailures.mode, input.mode as ReminderDispatchMode),
        eq(reminderDispatchFailures.dispatchKey, input.dispatchKey),
        eq(reminderDispatchFailures.reminderId, input.reminderId),
        eq(reminderDispatchFailures.channel, input.channel)
      ))
      .limit(1);
    
    const row = result[0];
    if (!row) return null;
    return {
      attemptCount: Number(row.attemptCount || 0),
      nextRetryAt: row.nextRetryAt ? row.nextRetryAt.toISOString() : '',
      lastError: String(row.lastError || ''),
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : '',
    };
  }

  async recordFailure(input: RecordReminderDispatchFailureInput) {
    const workspaceId = await resolveWorkspaceId(this.database, input.userId, input.workspaceSlug);
    const result = await this.database.getPool().query(
      `insert into kb_reminder_dispatch_failures (
         user_id,
         workspace_id,
         mode,
         dispatch_key,
         reminder_id,
         channel,
         attempt_count,
         next_retry_at,
         last_error
       )
       values ($1, $2, $3, $4, $5, $6, 1, nullif($7, '')::timestamptz, $8)
       on conflict (user_id, workspace_id, mode, dispatch_key, reminder_id, channel)
       do update set
         attempt_count = least(kb_reminder_dispatch_failures.attempt_count + 1, 5),
         next_retry_at = excluded.next_retry_at,
         last_error = excluded.last_error,
         updated_at = now()
       returning attempt_count, next_retry_at, last_error, updated_at`,
      [
        input.userId,
        workspaceId,
        input.mode,
        input.dispatchKey,
        input.reminderId,
        input.channel,
        input.nextRetryAt,
        input.error,
      ],
    );
    const row = result.rows[0];
    return {
      attemptCount: Number(row.attempt_count || 0),
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at).toISOString() : '',
      lastError: String(row.last_error || ''),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
    };
  }

  async clearFailure(input: ReminderDispatchRetryKey) {
    const db = this.database.getDb();
    const workspaceId = await resolveWorkspaceId(this.database, input.userId, input.workspaceSlug);
    await db
      .delete(reminderDispatchFailures)
      .where(and(
        eq(reminderDispatchFailures.userId, input.userId),
        eq(reminderDispatchFailures.workspaceId, workspaceId),
        eq(reminderDispatchFailures.mode, input.mode as ReminderDispatchMode),
        eq(reminderDispatchFailures.dispatchKey, input.dispatchKey),
        eq(reminderDispatchFailures.reminderId, input.reminderId),
        eq(reminderDispatchFailures.channel, input.channel)
      ));
  }
}
