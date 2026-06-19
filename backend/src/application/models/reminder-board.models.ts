import { ReminderBoardColumnKey, KnowledgeStatus } from '../../contracts/enums.js';

export type ReminderBoardInput = {
  workspaceSlug?: string;
  projectSlug?: string;
  limitPerColumn: number;
  columnPage: Record<ReminderBoardColumnKey, number>;
};

export type UpdateReminderStatusInput = {
  id: string;
  status: KnowledgeStatus;
};

export const reminderBoardColumnKeys: ReminderBoardColumnKey[] = [
  ReminderBoardColumnKey.Overdue,
  ReminderBoardColumnKey.Upcoming,
  ReminderBoardColumnKey.Resolved,
  ReminderBoardColumnKey.Archived,
];
