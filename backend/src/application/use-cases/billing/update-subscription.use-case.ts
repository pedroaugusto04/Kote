import { Injectable } from '@nestjs/common';
import { QuotaService } from '../../services/quota.service.js';
import { SubscriptionService } from '../../services/billing/SubscriptionService.js';
import { BillingCycle, BillingType } from '../../../domain/enums/billing.enums.js';
import { BillingEventBus } from '../../services/billing-event.bus.js';

@Injectable()
export class UpdateSubscriptionUseCase {
  constructor(
    private readonly quotaService: QuotaService,
    private readonly subscriptionService: SubscriptionService,
    private readonly billingEventBus: BillingEventBus,
  ) {}

  async execute(params: {
    userId: string;
    email: string;
    displayName: string | null;
    planId: string;
    billingCycle?: BillingCycle;
    billingType?: BillingType;
    cpfCnpj?: string;
    countryCode?: string;
    creditCardToken?: string;
  }) {
    const result = await this.subscriptionService.registerOrUpdateSubscription(
      params.userId,
      params.email,
      params.displayName,
      params.planId,
      params.billingCycle,
      params.billingType,
      params.cpfCnpj,
      params.countryCode,
      params.creditCardToken,
    );

    this.billingEventBus.emit(params.userId);

    const quotaStatus = await this.quotaService.getQuotaStatus(params.userId);
    return {
      ...quotaStatus,
      summary: result.summary,
      changeKind: result.changeKind,
    };
  }
}
