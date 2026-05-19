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
    const leftPendingRank = left.status === 'pending' ? 0 : 1;
    const rightPendingRank = right.status === 'pending' ? 0 : 1;
    return leftPendingRank - rightPendingRank
      || reminderTimestamp(left) - reminderTimestamp(right)
      || left.title.localeCompare(right.title)
      || left.id.localeCompare(right.id);
  });
}
