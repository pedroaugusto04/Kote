import { KnowledgeStatus } from '../../../contracts/enums.js';
import { resolveReminderScheduledAt } from './reminder-schedule.js';

const OPEN_REMINDER_STATUSES = new Set([
  KnowledgeStatus.Open,
  KnowledgeStatus.Active,
  'pending',
  'todo',
]);

export function resolveReminderListStatus(input: {
  status?: string;
  reminderDate?: string;
  reminderTime?: string;
  reminderAt?: string;
  sent?: boolean;
  now?: Date;
}): string {
  const status = String(input.status || '').trim().toLowerCase();
  if (!status) return '';
  if (!OPEN_REMINDER_STATUSES.has(status)) return status;
  if (input.sent) return 'sent';

  const scheduledAt = resolveReminderScheduledAt({
    reminderDate: input.reminderDate,
    reminderTime: input.reminderTime,
    reminderAt: input.reminderAt,
  });

  if (!scheduledAt) return 'active';
  const scheduledTimestamp = Date.parse(scheduledAt);
  if (Number.isNaN(scheduledTimestamp)) return 'active';
  return scheduledTimestamp < (input.now || new Date()).getTime() ? 'expired' : 'active';
}
