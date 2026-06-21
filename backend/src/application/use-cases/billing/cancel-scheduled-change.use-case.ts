import { Injectable } from '@nestjs/common';
import { SubscriptionService } from '../../services/billing-stubs.service.js';
import { BillingEventBus } from '../../services/billing-event.bus.js';

@Injectable()
export class CancelScheduledChangeUseCase {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly billingEventBus: BillingEventBus,
  ) {}

  async execute(userId: string, changeId: string) {
    await this.subscriptionService.cancelScheduledChange(userId, changeId);
    this.billingEventBus.emit(userId);
    return { ok: true as const };
  }
}
