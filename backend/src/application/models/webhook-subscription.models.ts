import type { WebhookTrigger } from '../../contracts/enums.js';

export type WebhookSubscriptionRecord = {
  id: string;
  userId: string;
  workspaceSlug: string;
  label: string;
  url: string;
  secret: string | null;
  events: WebhookTrigger[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
