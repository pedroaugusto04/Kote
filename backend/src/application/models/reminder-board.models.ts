import type { ReminderBoardColumnKey } from './reminder.models.js';

export type ReminderBoardInput = {
  workspaceSlug?: string;
  projectSlug?: string;
  limitPerColumn: number;
};

export type UpdateReminderStatusInput = {
  id: string;
  status: 'pending' | 'resolved' | 'archived';
};

export const reminderBoardColumnKeys: ReminderBoardColumnKey[] = ['overdue', 'upcoming', 'resolved', 'archived'];
