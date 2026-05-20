import type { ReminderDeliveryChannel, ReminderDispatchMode } from '../../contracts/enums.js';

export type ReminderDispatchRetryState = {
  attemptCount: number;
  nextRetryAt: string;
  lastError: string;
  updatedAt: string;
};

export type ReminderDispatchRetryKey = {
  userId: string;
  workspaceSlug: string;
  mode: ReminderDispatchMode;
  dispatchKey: string;
  reminderId: string;
  channel: ReminderDeliveryChannel;
};

export type RecordReminderDispatchFailureInput = ReminderDispatchRetryKey & {
  nextRetryAt: string;
  error: string;
};
