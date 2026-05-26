import type { WebhookSubscriptionRecord } from '../../models/webhook-subscription.models.js';

export abstract class WebhookSubscriptionRepository {
  abstract list(userId: string, workspaceSlug: string): Promise<WebhookSubscriptionRecord[]>;

  abstract findById(userId: string, id: string): Promise<WebhookSubscriptionRecord | null>;

  abstract create(input: Omit<WebhookSubscriptionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<WebhookSubscriptionRecord>;

  abstract update(
    userId: string,
    id: string,
    input: Partial<Pick<WebhookSubscriptionRecord, 'label' | 'url' | 'secret' | 'events' | 'enabled'>>,
  ): Promise<WebhookSubscriptionRecord | null>;

  abstract delete(userId: string, id: string): Promise<boolean>;

  abstract findByEvent(userId: string, workspaceSlug: string, event: string): Promise<WebhookSubscriptionRecord[]>;
}
