import { Injectable } from '@nestjs/common';
import { SubscriptionService } from '../../services/billing-stubs.service.js';

@Injectable()
export class CancelPaymentUseCase {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  async execute(userId: string, paymentId: string) {
    await this.subscriptionService.cancelPendingPayment(userId, paymentId);
    return { ok: true as const };
  }
}
