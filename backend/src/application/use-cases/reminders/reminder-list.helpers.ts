export function reminderTimestamp(reminder: { reminderAt?: string; reminderDate?: string; reminderTime?: string }) {
  const direct = Date.parse(reminder.reminderAt || '');
  if (!Number.isNaN(direct)) return direct;
  const fallback = Date.parse(`${reminder.reminderDate || ''}T${reminder.reminderTime || '00:00'}:00.000Z`);
  if (!Number.isNaN(fallback)) return fallback;
  return Number.MAX_SAFE_INTEGER;
}

export function sortRemindersBySchedule<T extends { id: string; title: string; reminderAt?: string; reminderDate?: string; reminderTime?: string }>(
  reminders: T[],
) {
  return [...reminders].sort((left, right) => reminderTimestamp(left) - reminderTimestamp(right)
    || left.title.localeCompare(right.title)
    || left.id.localeCompare(right.id));
}

export function sortRemindersForList<T extends { id: string; title: string; status: string; reminderAt?: string; reminderDate?: string; reminderTime?: string }>(
  reminders: T[],
  statusFilter?: string,
) {
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

function reminderOpenRank(status: string) {
  if (status === 'overdue') return 0;
  if (status === 'pending') return 1;
  return 2;
}
