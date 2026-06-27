import { ReminderBoardColumnKey } from '../../shared/api/models/reminder';
import { NoteStatus } from '../../shared/api/models/note-status';

export type ReminderBoardTargetStatus = NoteStatus.Pending | NoteStatus.Resolved | NoteStatus.Archived;

export type KanbanBoardColumn = {
  key: ReminderBoardColumnKey;
  title: string;
  empty: string;
  targetStatus?: ReminderBoardTargetStatus;
  blockedDropMessage?: string;
};

export const kanbanBoardColumns: KanbanBoardColumn[] = [
  {
    key: ReminderBoardColumnKey.Overdue,
    title: 'Overdue',
    empty: 'No overdue reminders.',
    blockedDropMessage: 'Reminders cannot be manually set to overdue.',
  },
  { key: ReminderBoardColumnKey.Upcoming, title: 'Upcoming', empty: 'No upcoming reminders.', targetStatus: NoteStatus.Pending },
  { key: ReminderBoardColumnKey.Resolved, title: 'Resolved', empty: 'No resolved reminders.', targetStatus: NoteStatus.Resolved },
  { key: ReminderBoardColumnKey.Archived, title: 'Archived', empty: 'No archived reminders.', targetStatus: NoteStatus.Archived },
];

