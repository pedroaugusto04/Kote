import type { ReminderDeliveryChannel } from '../../../contracts/enums.js';

export type ReminderDeliveryResult = {
  ok: boolean;
  error?: string;
};

export type ReminderSendTextInput = {
  channel: ReminderDeliveryChannel;
  recipientId: string;
  text: string;
  workspaceSlug: string;
  userId: string;
  metadata?: Record<string, unknown>;
};

export abstract class ReminderDeliveryGateway {
  abstract sendText(input: ReminderSendTextInput): Promise<ReminderDeliveryResult>;
}
