import type { WebhookTrigger } from '../contracts/enums.js';

export type NoteEventPayload = {
  event: WebhookTrigger;
  noteId: string;
  userId: string;
  workspaceSlug: string;
  projectSlug: string;
  title: string;
  occurredAt: string;
};
