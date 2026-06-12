export function reminderTimestamp(reminder: { reminderAt?: string; reminderDate?: string; reminderTime?: string }) {
  const direct = Date.parse(reminder.reminderAt || '');
  if (!Number.isNaN(direct)) return direct;
  const fallback = Date.parse(`${reminder.reminderDate || ''}T${reminder.reminderTime || '00:00'}:00.000Z`);
  if (!Number.isNaN(fallback)) return fallback;
  return Number.MAX_SAFE_INTEGER;
}

function reminderIsFuture(reminder: { reminderAt?: string; reminderDate?: string; reminderTime?: string }, now = Date.now()): boolean {
  return reminderTimestamp(reminder) > now;
}

function reminderStatusRank(status: string) {
  if (status === 'overdue') return 0;
  if (status === 'pending') return 1;
  if (status === 'sent') return 2;
  return 3; // archived or other
}

export function sortRemindersBySchedule<T extends { id: string; title: string; status: string; reminderAt?: string; reminderDate?: string; reminderTime?: string }>(
  reminders: T[],
) {
  return [...reminders].sort((left, right) => reminderStatusRank(left.status) - reminderStatusRank(right.status)
    || (reminderIsFuture(left) 
        ? reminderTimestamp(left) - reminderTimestamp(right) 
        : reminderTimestamp(right) - reminderTimestamp(left))
    || left.title.localeCompare(right.title)
    || left.id.localeCompare(right.id));
}

export function sortRemindersForList<T extends { id: string; title: string; status: string; reminderAt?: string; reminderDate?: string; reminderTime?: string }>(
  reminders: T[],
  statusFilter?: string,
) {
  if (statusFilter && statusFilter !== 'active' && statusFilter !== 'open' && statusFilter !== 'all') return reminders;
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
