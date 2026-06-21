import { Injectable } from '@nestjs/common';
import { QuotaService } from '../../services/quota.service.js';
import { SubscriptionService } from '../../services/billing-stubs.service.js';
import { BillingCycle, BillingType } from '../../../domain/enums/billing.enums.js';

@Injectable()
export class UpdateSubscriptionUseCase {
  constructor(
    private readonly quotaService: QuotaService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async execute(params: {
    userId: string;
    email: string;
    displayName: string | null;
    planId: string;
    billingCycle?: BillingCycle;
    billingType?: BillingType;
  }) {
    await this.subscriptionService.registerOrUpdateSubscription(
      params.userId,
      params.email,
      params.displayName,
      params.planId,
      params.billingCycle,
      params.billingType,
    );

    const quotaStatus = await this.quotaService.getQuotaStatus(params.userId);
    const summary = await this.subscriptionService.getSubscriptionStatusSummary(params.userId);
    return {
      ...quotaStatus,
      summary,
    };
  }
}
