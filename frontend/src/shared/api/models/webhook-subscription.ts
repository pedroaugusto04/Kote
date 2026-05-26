export type WebhookTriggerDefinition = {
  trigger: string;
  group: string;
  label: string;
  description: string;
};

export type WebhookSubscription = {
  id: string;
  userId: string;
  workspaceSlug: string;
  label: string;
  url: string;
  secret: string | null;
  events: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WebhookTriggersResponse = {
  ok: true;
  triggers: WebhookTriggerDefinition[];
};
