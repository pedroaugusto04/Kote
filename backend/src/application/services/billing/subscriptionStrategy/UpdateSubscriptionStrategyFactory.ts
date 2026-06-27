import { Injectable, BadRequestException } from '@nestjs/common';
import { SubscriptionChangeKind } from '../../../../domain/enums/billing.enums.js';
import { resolvePlanPriceCentsForGateway } from '../../../../domain/utils/plan-pricing.utils.js';
import { SubscriptionContext } from './subscriptionContext.js';
import { compareMoney, PLAN_PRICE_SCALE } from '../../../../infrastructure/utils/money.js';

@Injectable()
export class UpdateSubscriptionStrategyFactory {
  getChangeKind(ctx: SubscriptionContext): SubscriptionChangeKind {
    const activeSub = ctx.activeSub;

    if (!activeSub) {
      return SubscriptionChangeKind.NEW;
    }

    // Validate: cannot mix gateways for existing subscriptions
    if (activeSub.gatewayName && ctx.gateway.toLowerCase() !== activeSub.gatewayName.toLowerCase()) {
      throw new BadRequestException(`Cannot change gateway from ${activeSub.gatewayName} to ${ctx.gateway}. Please cancel current subscription first.`);
    }

    const activePriceCents = resolvePlanPriceCentsForGateway(
      ctx.activePlan ?? { priceCents: 0, priceUsdCents: 0 },
      ctx.gateway,
    );
    const newPriceCents = resolvePlanPriceCentsForGateway(ctx.newPlan, ctx.gateway);

    const priceComparison = compareMoney(
      activePriceCents,
      newPriceCents,
      PLAN_PRICE_SCALE,
    );

    if (activeSub.billingCycle !== ctx.newBillingCycle) {
      return SubscriptionChangeKind.CHANGE_CYCLE;
    }

    if (priceComparison < 0) {
      return SubscriptionChangeKind.UPGRADE;
    }

    return SubscriptionChangeKind.DOWNGRADE;
  }
}
