import type { EmailSendPayload } from '../../models/email.models.js';

export abstract class EmailProvider {
  abstract sendEmail(payload: EmailSendPayload): Promise<void>;
}
