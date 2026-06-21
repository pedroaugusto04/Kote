import { Injectable } from '@nestjs/common';
import { SubscriptionChangeKind } from './subscriptionChangeKind.js';
import { SubscriptionContext } from './subscriptionContext.js';
import { UpdateSubscriptionStrategy } from './UpdateSubscriptionStrategy.js';
import { compareMoney, PLAN_PRICE_SCALE } from '../../../../infrastructure/utils/money.js';

@Injectable()
export class UpdateSubscriptionStrategyFactory {
  constructor(
    // Strategies serão injetadas via NestJS DI
  ) {}

  getChangeKind(ctx: SubscriptionContext): SubscriptionChangeKind {
    const activeSub = ctx.activeSub;

    // caso nao tenha assinatura ativa -> cria nova
    if (!activeSub) return SubscriptionChangeKind.NEW;

    // Adaptado para knowledge-base: usa priceCents em vez de price
    const currentPrice = ctx.activePlan?.priceCents ?? 0;
    const newPrice = ctx.newPlan?.priceCents ?? 0;

    const priceComparison = compareMoney(
      currentPrice,
      newPrice,
      PLAN_PRICE_SCALE
    );

    // compara ciclo para definir se eh mudanca de ciclo
    if (activeSub.billingCycle !== ctx.newBillingCycle) {
      return SubscriptionChangeKind.CHANGE_CYCLE;
    }

    // compara valor para definir se eh upgrade/downgrade
    if (priceComparison < 0) {
      return SubscriptionChangeKind.UPGRADE;
    }

    return SubscriptionChangeKind.DOWNGRADE;
  }

  getStrategy(
    kind: SubscriptionChangeKind,
    strategies: {
      newStrategy: UpdateSubscriptionStrategy;
      upgradeProrationStrategy: UpdateSubscriptionStrategy;
      downgradeStrategy: UpdateSubscriptionStrategy;
      changeCycleStrategy: UpdateSubscriptionStrategy;
    }
  ): UpdateSubscriptionStrategy {
    switch (kind) {
      case SubscriptionChangeKind.UPGRADE:
        return strategies.upgradeProrationStrategy;

      case SubscriptionChangeKind.DOWNGRADE:
        return strategies.downgradeStrategy;

      case SubscriptionChangeKind.CHANGE_CYCLE:
        return strategies.changeCycleStrategy;

      case SubscriptionChangeKind.NEW:
      default:
        return strategies.newStrategy;
    }
  }
}
