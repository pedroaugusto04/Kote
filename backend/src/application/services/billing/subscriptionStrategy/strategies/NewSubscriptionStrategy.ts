import { SubscriptionContext } from '../subscriptionContext.js';
import { UpdateSubscriptionStrategy, UpdateSubscriptionStrategyResult } from '../UpdateSubscriptionStrategy.js';
import type { SubscriptionService } from '../../SubscriptionService.js';
import { SubscriptionChangeKind } from '../subscriptionChangeKind.js';

export class NewSubscriptionStrategy implements UpdateSubscriptionStrategy {
  constructor(
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async execute(ctx: SubscriptionContext): Promise<UpdateSubscriptionStrategyResult> {
    await this.subscriptionService.createNewSubscription({
      gatewayCustomerId: ctx.gatewayCustomerId,
      userId: ctx.userId,
      targetPlanId: ctx.newPlan.id,
      billingCycle: ctx.newBillingCycle,
      billingType: ctx.newBillingType,
      creditCardToken: ctx.newCreditCardToken,
      gatewayName: ctx.gateway === 'ASAAS' ? 'asaas' : 'stripe',
    });

    const statusSummary = await this.subscriptionService.getSubscriptionStatusSummary(ctx.userId);
    const summary = statusSummary ?? undefined;

    return { summary, changeKind: SubscriptionChangeKind.NEW };
  }
}
