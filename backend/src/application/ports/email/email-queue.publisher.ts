import type { EmailSendPayload } from '../../models/email.models.js';

export abstract class EmailQueuePublisher {
  abstract publishEmailMessage(payload: EmailSendPayload): Promise<void>;
}
