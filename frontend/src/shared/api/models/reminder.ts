import type { NoteStatus } from './note-status';

export type Reminder = {
  id: string;
  title: string;
  noteText?: string;
  project: string;
  workspace?: string;
  status: NoteStatus;
  isOverdue: boolean;
  reminderDate: string;
  reminderTime: string;
  reminderAt: string;
  relativePath: string;
};

export enum ReminderBoardColumnKey {
  Overdue = 'overdue',
  Upcoming = 'upcoming',
  Resolved = 'resolved',
  Archived = 'archived',
}

export type ReminderBoardCard = Reminder;

export type ReminderBoardColumn = {
  items: ReminderBoardCard[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

export type ReminderBoardResponse = {
  ok: true;
  columns: Record<ReminderBoardColumnKey, ReminderBoardColumn>;
};
