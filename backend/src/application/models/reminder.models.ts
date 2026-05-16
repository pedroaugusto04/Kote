import type { ReminderDeliveryChannel } from '../../contracts/enums.js';

export type ReminderView = {
  id: string;
  title: string;
  noteText: string;
  project: string;
  workspace: string;
  status: string;
  isOverdue: boolean;
  reminderDate: string;
  reminderTime: string;
  reminderAt: string;
  relativePath: string;
};

export type DueReminderView = {
  userId: string;
  workspaceSlug: string;
  channel: ReminderDeliveryChannel;
  recipientId: string;
  reminderId: string;
  title: string;
  noteText: string;
  project: string;
  relativePath: string;
  status: string;
  scheduledAt: string;
};
