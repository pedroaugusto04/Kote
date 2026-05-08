import type { PaginationMeta } from './pagination.models.js';
import type { ReminderView } from './reminder.models.js';

export type ListRemindersInput = {
  page: number;
  pageSize: number;
  workspaceSlug?: string;
  status?: string;
};

export type PaginatedReminders = {
  items: ReminderView[];
  pagination: PaginationMeta;
};
