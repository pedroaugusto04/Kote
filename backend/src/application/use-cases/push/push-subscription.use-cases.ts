import { Injectable, NotFoundException } from '@nestjs/common';
import { PushSubscriptionRepository } from '../../ports/push/push-subscription.repository.js';
import type { PushSubscriptionRecord } from '../../models/repository-records.models.js';

export type CreatePushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

@Injectable()
export class ListPushSubscriptionsUseCase {
  constructor(private readonly repo: PushSubscriptionRepository) {}

  async execute(userId: string): Promise<PushSubscriptionRecord[]> {
    return this.repo.listByUserId(userId);
  }
}

@Injectable()
export class CreatePushSubscriptionUseCase {
  constructor(private readonly repo: PushSubscriptionRepository) {}

  async execute(userId: string, input: CreatePushSubscriptionInput): Promise<PushSubscriptionRecord> {
    return this.repo.save({
      userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
    });
  }
}

@Injectable()
export class DeletePushSubscriptionUseCase {
  constructor(private readonly repo: PushSubscriptionRepository) {}

  async execute(userId: string, endpoint: string): Promise<{ ok: boolean }> {
    const deleted = await this.repo.deleteByEndpoint(userId, endpoint);
    if (!deleted) throw new NotFoundException('push_subscription_not_found');
    return { ok: true };
  }
}
