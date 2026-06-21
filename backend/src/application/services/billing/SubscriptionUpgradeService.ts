import { Injectable, BadRequestException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { PostgresDatabase } from '../../../infrastructure/persistence/database.js';
import { plans } from '../../../infrastructure/persistence/schema/index.js';
import { BillingCycle } from '../../../domain/enums/billing.enums.js';
import { compareMoney, PLAN_PRICE_SCALE, toMoneyDecimal, toMoneyNumber } from '../../../infrastructure/utils/money.js';
import { AsaasPaymentGateway } from '../../../infrastructure/billing/gateways/asaas/AsaasPaymentGateway.js';
import { StripePaymentGateway } from '../../../infrastructure/billing/gateways/stripe/StripePaymentGateway.js';
import { GatewayNameEnum } from '../../../infrastructure/billing/gateways/IPaymentGateway.js';
import { AppLogger } from '../../../observability/logger.js';
import type { SubscriptionContext } from './subscriptionStrategy/subscriptionContext.js';

type BillingValueInput = string | number | { toString(): string } | null | undefined;

@Injectable()
export class SubscriptionUpgradeService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly asaasPaymentGateway: AsaasPaymentGateway,
    private readonly stripePaymentGateway: StripePaymentGateway,
    private readonly logger: AppLogger,
  ) {}

  async getUpgradeFirstPaymentValue(ctx: SubscriptionContext): Promise<number> {
    if (!ctx.activeSub) {
      throw new BadRequestException('Unable to change subscription plan. Please try again later.');
    }
    if (!ctx.activePlan) {
      throw new BadRequestException('Active plan not found for upgrade calculation');
    }
    if (!ctx.newPlan) {
      throw new BadRequestException('Target plan not found for upgrade calculation');
    }

    const gateway = ctx.gateway === GatewayNameEnum.STRIPE
      ? this.stripePaymentGateway
      : this.asaasPaymentGateway;

    const gatewaySubscription = await gateway.getSubscriptionByGatewayId(ctx.activeSub.gatewaySubscriptionId);
    if (!gatewaySubscription?.nextDueDate) {
      this.logger.error('subscription_upgrade.gateway_subscription_missing', {
        gatewaySubscriptionId: ctx.activeSub.gatewaySubscriptionId,
        gateway: ctx.gateway,
      });
      throw new BadRequestException('Unable to change subscription plan. Please try again later.');
    }

    const periodEnd = ctx.activeSub.nextDueDate ?? new Date(gatewaySubscription.nextDueDate);
    const deltaPrice = await this.calculateProrationUpgradeValue({
      currentPlanId: ctx.activePlan.id,
      newPlanId: ctx.newPlan.id,
      billingCycle: ctx.activeSub.billingCycle,
      currentPeriodEnd: periodEnd,
    });

    const fallbackValue = ctx.newSubscriptionValue ?? await this.resolvePlanValueForCycle(ctx.newPlan, ctx.activeSub.billingCycle);

    return compareMoney(deltaPrice, 0, PLAN_PRICE_SCALE) > 0 ? deltaPrice : fallbackValue;
  }

  async calculateProrationUpgradeValue(params: {
    currentPlanId: string;
    newPlanId: string;
    billingCycle: BillingCycle;
    currentPeriodEnd: Date;
  }): Promise<number> {
    if (!params.currentPlanId || !params.newPlanId) {
      throw new BadRequestException('Plan IDs cannot be empty');
    }

    const db = this.database.getDb();

    const currentPlan = await db.select().from(plans).where(eq(plans.id, params.currentPlanId)).limit(1).then(r => r[0] || null);
    const newPlan = await db.select().from(plans).where(eq(plans.id, params.newPlanId)).limit(1).then(r => r[0] || null);

    if (!currentPlan || !newPlan) {
      throw new BadRequestException('Plan not found for proration calculation');
    }

    const currentPrice = this.priceForCycle(currentPlan, params.billingCycle);
    const newPrice = this.priceForCycle(newPlan, params.billingCycle);

    return this.computeProrationDelta({
      currentPrice,
      newPrice,
      currentBillingCycle: params.billingCycle,
      periodEnd: params.currentPeriodEnd,
    });
  }

  private async resolvePlanValueForCycle(
    plan: { priceCents: number; priceUsdCents: number },
    cycle: BillingCycle,
  ): Promise<number> {
    if (cycle === BillingCycle.YEARLY) {
      return (plan.priceCents * 12 * 0.8) / 100;
    }
    return plan.priceCents / 100;
  }

  private computeProrationDelta(params: {
    currentPrice: number;
    newPrice: number;
    currentBillingCycle: BillingCycle;
    periodEnd?: Date;
    today?: Date;
  }): number {
    const today = params.today || new Date();
    const periodEnd = params.periodEnd;

    const msPerDay = 24 * 60 * 60 * 1000;
    const daysRemaining = periodEnd
      ? Math.max(0, Math.floor((periodEnd.getTime() - today.getTime()) / msPerDay))
      : 0;

    const daysInCycle = params.currentBillingCycle === BillingCycle.YEARLY ? 365 : 30;

    const currentPriceDecimal = toMoneyDecimal(params.currentPrice, PLAN_PRICE_SCALE);
    const newPriceDecimal = toMoneyDecimal(params.newPrice, PLAN_PRICE_SCALE);
    const rawDelta = newPriceDecimal.minus(currentPriceDecimal).times(daysRemaining).div(daysInCycle);

    if (rawDelta.comparedTo(0) <= 0) {
      return 0;
    }

    return toMoneyNumber(rawDelta, PLAN_PRICE_SCALE);
  }

  private priceForCycle(plan: { priceCents: number; priceUsdCents: number }, cycle: BillingCycle): number {
    if (cycle === BillingCycle.YEARLY) {
      const annualPrice = (plan.priceCents * 12 * 0.8) / 100;
      if (compareMoney(annualPrice, 0, PLAN_PRICE_SCALE) <= 0) {
        throw new BadRequestException('Annual payment unavailable for this plan');
      }
      return annualPrice;
    }

    const monthlyPrice = plan.priceCents / 100;
    if (compareMoney(monthlyPrice, 0, PLAN_PRICE_SCALE) < 0) {
      throw new BadRequestException('Invalid monthly price for this plan');
    }

    return monthlyPrice;
  }
}
