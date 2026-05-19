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

export type ReminderBoardColumnKey = 'overdue' | 'upcoming' | 'resolved' | 'archived';

export type ReminderBoardCard = Reminder;

export type ReminderBoardColumn = {
  items: ReminderBoardCard[];
  total: number;
};

export type ReminderBoardResponse = {
  ok: true;
  columns: Record<ReminderBoardColumnKey, ReminderBoardColumn>;
};
