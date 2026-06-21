import { Injectable } from '@nestjs/common';
import { SubscriptionService } from '../../services/billing-stubs.service.js';

@Injectable()
export class CancelScheduledChangeUseCase {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  async execute(userId: string, changeId: string) {
    await this.subscriptionService.cancelScheduledChange(userId, changeId);
    return { ok: true as const };
  }
}
