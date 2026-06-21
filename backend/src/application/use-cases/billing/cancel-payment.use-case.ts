import { Injectable } from '@nestjs/common';
import { SubscriptionService } from '../../services/billing-stubs.service.js';
import { BillingEventBus } from '../../services/billing-event.bus.js';

@Injectable()
export class CancelPaymentUseCase {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly billingEventBus: BillingEventBus,
  ) {}

  async execute(userId: string, paymentId: string) {
    await this.subscriptionService.cancelPendingPayment(userId, paymentId);
    this.billingEventBus.emit(userId);
    return { ok: true as const };
  }
}
