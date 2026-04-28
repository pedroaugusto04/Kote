import type { ReminderDispatchMode } from '../../contracts/enums.js';
import type { ConversationStateRecord } from '../models/repository-records.models.js';

export abstract class ConversationStateRepository {
  abstract get(userId: string, workspaceSlug: string, conversationKey: string): Promise<ConversationStateRecord | null>;
  abstract upsert(userId: string, workspaceSlug: string, conversationKey: string, state: unknown): Promise<ConversationStateRecord>;
  abstract clear(userId: string, workspaceSlug: string, conversationKey: string): Promise<void>;
}

export abstract class ReminderDispatchRepository {
  abstract hasSent(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string): Promise<boolean>;
  abstract markSent(userId: string, workspaceSlug: string, mode: ReminderDispatchMode, dispatchKey: string, reminderId: string): Promise<void>;
}
