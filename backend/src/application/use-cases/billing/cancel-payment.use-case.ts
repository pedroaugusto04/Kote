import { Injectable } from '@nestjs/common';
import { SubscriptionCancellationService } from '../../services/billing/SubscriptionCancellationService.js';
import { BillingEventBus } from '../../services/billing-event.bus.js';

@Injectable()
export class CancelPaymentUseCase {
  constructor(
    private readonly subscriptionCancellationService: SubscriptionCancellationService,
    private readonly billingEventBus: BillingEventBus,
  ) {}

  async execute(userId: string, paymentId: string) {
    await this.subscriptionCancellationService.cancelPendingPayment(userId, paymentId);
    this.billingEventBus.emit(userId);
    return { ok: true as const };
  }
}
