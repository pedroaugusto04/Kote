import { Injectable } from '@nestjs/common';
import { QuotaService } from '../../services/quota/quota.service.js';
import { SubscriptionService } from '../../services/billing/subscription.service.js';
import { type BillingCycle, type BillingType } from '../../../domain/enums/billing.enums.js';
import { BillingEventBus } from '../../event-buses/billing-event.bus.js';
import { UserSubscriptionMapper } from '../../mappers/billing.mapper.js';

export interface UpdateSubscriptionInput {
  userId: string;
  email: string;
  displayName: string | null;
  planId: string;
  billingCycle?: BillingCycle;
  billingType?: BillingType;
  cpfCnpj?: string;
  countryCode?: string;
  creditCardToken?: string;
}

@Injectable()
export class UpdateSubscriptionUseCase {
  constructor(
    private readonly quotaService: QuotaService,
    private readonly subscriptionService: SubscriptionService,
    private readonly billingEventBus: BillingEventBus,
  ) {}

  async execute(params: UpdateSubscriptionInput) {
    const result = await this.subscriptionService.registerOrUpdateSubscription(
      UserSubscriptionMapper.toRegisterOrUpdateInput(params),
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
