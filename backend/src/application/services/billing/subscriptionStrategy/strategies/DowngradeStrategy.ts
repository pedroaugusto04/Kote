import { Injectable } from '@nestjs/common';
import { SubscriptionContext } from '../subscriptionContext.js';
import { UpdateSubscriptionStrategy, UpdateSubscriptionStrategyResult } from '../UpdateSubscriptionStrategy.js';
import { SubscriptionService } from '../../SubscriptionService.js';

@Injectable()
export class DowngradeStrategy implements UpdateSubscriptionStrategy {
  constructor(
    private readonly subscriptionService: SubscriptionService
  ) {}

  async execute(ctx: SubscriptionContext): Promise<UpdateSubscriptionStrategyResult> {
    return await this.subscriptionService.downgradeSubscription(ctx);
  }
}
