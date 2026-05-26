import { Injectable, NotFoundException } from '@nestjs/common';

import { WebhookSubscriptionRepository } from '../../ports/webhooks/webhook-subscription.repository.js';
import type { WebhookSubscriptionRecord } from '../../models/webhook-subscription.models.js';
import type { WebhookTrigger } from '../../../contracts/enums.js';

export type CreateWebhookSubscriptionInput = {
  workspaceSlug: string;
  label: string;
  url: string;
  secret?: string;
  events: WebhookTrigger[];
};

export type UpdateWebhookSubscriptionInput = {
  label?: string;
  url?: string;
  secret?: string;
  events?: WebhookTrigger[];
  enabled?: boolean;
};

@Injectable()
export class ListWebhookSubscriptionsUseCase {
  constructor(private readonly repo: WebhookSubscriptionRepository) {}

  async execute(userId: string, workspaceSlug: string): Promise<WebhookSubscriptionRecord[]> {
    return this.repo.list(userId, workspaceSlug);
  }
}

@Injectable()
export class CreateWebhookSubscriptionUseCase {
  constructor(private readonly repo: WebhookSubscriptionRepository) {}

  async execute(userId: string, input: CreateWebhookSubscriptionInput): Promise<WebhookSubscriptionRecord> {
    return this.repo.create({
      userId,
      workspaceSlug: input.workspaceSlug,
      label: input.label,
      url: input.url,
      secret: input.secret || null,
      events: input.events,
      enabled: true,
    });
  }
}

@Injectable()
export class UpdateWebhookSubscriptionUseCase {
  constructor(private readonly repo: WebhookSubscriptionRepository) {}

  async execute(userId: string, id: string, input: UpdateWebhookSubscriptionInput) {
    const updated = await this.repo.update(userId, id, input);
    if (!updated) throw new NotFoundException('webhook_subscription_not_found');
    return updated;
  }
}

@Injectable()
export class DeleteWebhookSubscriptionUseCase {
  constructor(private readonly repo: WebhookSubscriptionRepository) {}

  async execute(userId: string, id: string) {
    const deleted = await this.repo.delete(userId, id);
    if (!deleted) throw new NotFoundException('webhook_subscription_not_found');
    return { ok: true as const };
  }
}
