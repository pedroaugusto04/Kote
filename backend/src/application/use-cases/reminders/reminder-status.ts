import { KnowledgeStatus } from '../../../contracts/enums.js';
import { isReminderOverdue } from '../../../domain/note-status.js';

export function enrichReminderStatus<T extends {
  status?: string;
  reminderAt?: string;
}>(reminder: T, now?: Date) {
  const status = String(reminder.status || '').trim().toLowerCase();
  return {
    ...reminder,
    status: status || KnowledgeStatus.Pending,
    isOverdue: isReminderOverdue({ ...reminder, now }),
  };
}
