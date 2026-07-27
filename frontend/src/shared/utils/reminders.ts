import type { Reminder } from '../api/models/reminder';
import { StatusFilter } from '../api/models/note-status';

function reminderTimestamp(reminder: Pick<Reminder, 'reminderAt'>) {
  const direct = Date.parse(reminder.reminderAt || '');
  if (!Number.isNaN(direct)) return direct;
  return Number.MAX_SAFE_INTEGER;
}

function reminderIsFuture(reminder: Pick<Reminder, 'reminderAt'>, now = Date.now()): boolean {
  return reminderTimestamp(reminder) > now;
}

function reminderStatusRank(status: string) {
  if (status === 'overdue') return 0;
  if (status === 'pending') return 1;
  if (status === 'sent') return 2;
  return 3; // archived or other
}

export function sortRemindersForList(reminders: Reminder[], statusFilter: string) {
  if (statusFilter && statusFilter !== 'active' && statusFilter !== StatusFilter.Open && statusFilter !== StatusFilter.All) return reminders;
  return [...reminders].sort((left, right) => {
    const leftStatusRank = reminderStatusRank(left.status);
    const rightStatusRank = reminderStatusRank(right.status);
    return leftStatusRank - rightStatusRank
      || (reminderIsFuture(left) 
          ? reminderTimestamp(left) - reminderTimestamp(right) 
          : reminderTimestamp(right) - reminderTimestamp(left))
      || left.title.localeCompare(right.title)
      || left.id.localeCompare(right.id);
  });
}
