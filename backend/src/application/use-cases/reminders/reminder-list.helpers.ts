import { KnowledgeStatus, ReminderBoardColumnKey } from '../../../contracts/enums.js';
import { StatusFilter } from '../../../contracts/status-filters.js';
import { reminderBoardColumnKeys } from '../../models/reminder-board.models.js';
import type { ReminderBoardCard, ReminderBoardResponse } from '../../models/reminder.models.js';

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
  if (status === KnowledgeStatus.Overdue) return 0;
  if (status === KnowledgeStatus.Pending) return 1;
  if (status === KnowledgeStatus.Sent) return 2;
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
  if (statusFilter && statusFilter !== KnowledgeStatus.Active && statusFilter !== StatusFilter.Open && statusFilter !== StatusFilter.All) return reminders;
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

export function emptyColumns(limitPerColumn: number): ReminderBoardResponse['columns'] {
  return reminderBoardColumnKeys.reduce((acc, key) => {
    acc[key] = { items: [], total: 0, page: 1, pageSize: limitPerColumn, totalPages: 1, hasNext: false };
    return acc;
  }, {} as ReminderBoardResponse['columns']);
}

export function boardColumnKey(reminder: Pick<ReminderBoardCard, 'status' | 'isOverdue'>): ReminderBoardColumnKey {
  if (reminder.status === KnowledgeStatus.Resolved) return ReminderBoardColumnKey.Resolved;
  if (reminder.status === KnowledgeStatus.Archived) return ReminderBoardColumnKey.Archived;
  return reminder.status === KnowledgeStatus.Overdue || reminder.isOverdue ? ReminderBoardColumnKey.Overdue : ReminderBoardColumnKey.Upcoming;
}
