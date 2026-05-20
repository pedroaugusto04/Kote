import type { ReminderBoardColumnKey } from '../../shared/api/models/reminder';

export type ReminderBoardTargetStatus = 'pending' | 'resolved' | 'archived';

export type KanbanBoardColumn = {
  key: ReminderBoardColumnKey;
  title: string;
  empty: string;
  targetStatus?: ReminderBoardTargetStatus;
  blockedDropMessage?: string;
};

export const kanbanBoardColumns: KanbanBoardColumn[] = [
  {
    key: 'overdue',
    title: 'Overdue',
    empty: 'No overdue reminders.',
    blockedDropMessage: 'Reminders cannot be manually set to overdue.',
  },
  { key: 'upcoming', title: 'Upcoming', empty: 'No upcoming reminders.', targetStatus: 'pending' },
  { key: 'resolved', title: 'Resolved', empty: 'No resolved reminders.', targetStatus: 'resolved' },
  { key: 'archived', title: 'Archived', empty: 'No archived reminders.', targetStatus: 'archived' },
];
