import { Injectable } from '@nestjs/common';
import { QuotaService } from '../../services/quota.service.js';
import { SubscriptionService } from '../../services/billing/SubscriptionService.js';

@Injectable()
export class GetSubscriptionStatusUseCase {
  constructor(
    private readonly quotaService: QuotaService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async execute(userId: string) {
    const quotaStatus = await this.quotaService.getQuotaStatus(userId);
    const summary = await this.subscriptionService.getSubscriptionStatusSummary(userId);
    return {
      ...quotaStatus,
      summary,
    };
  }
}
