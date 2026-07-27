export type EmailSendPayload = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  templateName?: string;
  templateData?: Record<string, unknown>;
};
