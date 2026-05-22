import type { Reminder } from '../shared/api/models/reminder';

function reminderTimestamp(reminder: Pick<Reminder, 'reminderAt' | 'reminderDate' | 'reminderTime'>) {
  const direct = Date.parse(reminder.reminderAt || '');
  if (!Number.isNaN(direct)) return direct;
  const fallback = Date.parse(`${reminder.reminderDate || ''}T${reminder.reminderTime || '00:00'}:00.000Z`);
  if (!Number.isNaN(fallback)) return fallback;
  return Number.MAX_SAFE_INTEGER;
}

function reminderOpenRank(status: string) {
  if (status === 'overdue') return 0;
  if (status === 'pending') return 1;
  return 2;
}

export function sortRemindersForList(reminders: Reminder[], statusFilter: string) {
  if (statusFilter) return reminders;
  return [...reminders].sort((left, right) => {
    const leftOpenRank = reminderOpenRank(left.status);
    const rightOpenRank = reminderOpenRank(right.status);
    return leftOpenRank - rightOpenRank
      || reminderTimestamp(left) - reminderTimestamp(right)
      || left.title.localeCompare(right.title)
      || left.id.localeCompare(right.id);
  });
}
