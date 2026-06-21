import { Injectable } from '@nestjs/common';
import { SubscriptionChangeService } from '../../services/billing/SubscriptionChangeService.js';
import { BillingEventBus } from '../../services/billing-event.bus.js';

@Injectable()
export class CancelScheduledChangeUseCase {
  constructor(
    private readonly subscriptionChangeService: SubscriptionChangeService,
    private readonly billingEventBus: BillingEventBus,
  ) {}

  async execute(userId: string, changeId: string) {
    await this.subscriptionChangeService.cancelScheduledChange(userId, changeId);
    this.billingEventBus.emit(userId);
    return { ok: true as const };
  }
}
