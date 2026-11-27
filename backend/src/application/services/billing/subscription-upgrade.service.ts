import { Injectable } from '@nestjs/common';
import { BillingCycle, GatewayNameEnum } from '../../../domain/enums/billing.enums.js';
import { BillingRuleException, PlanNotFoundException } from '../../../domain/exceptions/index.js';
import { resolvePlanPriceCentsForGateway, resolvePlanValueForCycle } from '../../../domain/utils/plan-pricing.utils.js';
import { compareMoney, PLAN_PRICE_SCALE, toMoneyDecimal, toMoneyNumber } from '../../../domain/utils/money.utils.js';
import { GatewaySubscriptionMapper } from '../../mappers/billing.mapper.js';
import { AppLogger } from '../../../observability/logger.js';
import { SubscriptionRepository } from '../../ports/billing/billing-repositories.js';
import { PaymentGatewayFactory } from './payment-gateway.factory.js';
import type { SubscriptionContext } from './strategies/subscription-context.js';

@Injectable()
export class SubscriptionUpgradeService {
  constructor(
    private readonly paymentGatewayFactory: PaymentGatewayFactory,
    private readonly logger: AppLogger,
    private readonly subscriptionRepository: SubscriptionRepository,
  ) {}

  async getUpgradeFirstPaymentValue(ctx: SubscriptionContext): Promise<number> {
    if (!ctx.activeSub) {
      throw new BillingRuleException('Unable to change subscription plan. Please try again later.');
    }
    if (!ctx.activePlan) {
      throw new PlanNotFoundException('Active plan not found for upgrade calculation');
    }
    if (!ctx.newPlan) {
      throw new PlanNotFoundException('Target plan not found for upgrade calculation');
    }

    const gateway = this.paymentGatewayFactory.getGateway(ctx.gateway);

    let gatewaySubscription = await gateway.getSubscriptionByGatewayId(ctx.activeSub.gatewaySubscriptionId);
    
    // If subscription doesn't exist in gateway, create it
    if (!gatewaySubscription?.nextDueDate) {
      this.logger.warn('subscription_upgrade.gateway_subscription_missing_creating', {
        gatewaySubscriptionId: ctx.activeSub.gatewaySubscriptionId,
        gateway: ctx.gateway,
        userId: ctx.userId,
        activePlanId: ctx.activePlan?.id,
        newPlanId: ctx.newPlan?.id,
      });

      const price = resolvePlanValueForCycle(ctx.newPlan, ctx.activeSub.billingCycle, ctx.gateway);
      const nextDueDate = ctx.activeSub.nextDueDate || new Date();
      try {
        const newGatewaySubscription = await gateway.createSubscription(
          GatewaySubscriptionMapper.toGatewaySubscriptionPayload({
            customerId: ctx.gatewayCustomerId,
            billingType: ctx.newBillingType,
            value: price,
            billingCycle: ctx.activeSub.billingCycle,
            nextDueDate,
            planDisplayName: ctx.newPlan.displayName,
            creditCardToken: ctx.newCreditCardToken,
            userId: ctx.userId,
          }),
        );

        gatewaySubscription = newGatewaySubscription;
      } catch (error) {
        this.logger.error('subscription_upgrade.gateway_subscription_creation_failed', {
          error: error instanceof Error ? error.message : String(error),
          userId: ctx.userId,
        });
      }
    }

    if (!gatewaySubscription) {
      throw new BillingRuleException('Unable to change subscription plan. Please try again later.');
    }

    const periodEnd = ctx.activeSub.nextDueDate ?? (gatewaySubscription.nextDueDate ? new Date(gatewaySubscription.nextDueDate) : new Date());
    const deltaPrice = await this.calculateProrationUpgradeValue({
      currentPlanId: ctx.activePlan.id,
      newPlanId: ctx.newPlan.id,
      billingCycle: ctx.activeSub.billingCycle,
      currentPeriodEnd: periodEnd,
      gateway: ctx.gateway,
    });

    const fallbackValue = ctx.newSubscriptionValue ?? resolvePlanValueForCycle(
      ctx.newPlan,
      ctx.activeSub.billingCycle,
      ctx.gateway,
    );

    return compareMoney(deltaPrice, 0, PLAN_PRICE_SCALE) > 0 ? deltaPrice : fallbackValue;
  }

  async calculateProrationUpgradeValue(params: {
    currentPlanId: string;
    newPlanId: string;
    billingCycle: BillingCycle;
    currentPeriodEnd: Date;
    gateway: GatewayNameEnum;
  }): Promise<number> {
    if (!params.currentPlanId || !params.newPlanId) {
      throw new BillingRuleException('Plan IDs cannot be empty');
    }

    const currentPlan = await this.subscriptionRepository.getPlanById(params.currentPlanId);
    const newPlan = await this.subscriptionRepository.getPlanById(params.newPlanId);

    if (!currentPlan || !newPlan) {
      throw new PlanNotFoundException('Plan not found for proration calculation');
    }

    const currentPrice = this.priceForCycle(currentPlan, params.billingCycle, params.gateway);
    const newPrice = this.priceForCycle(newPlan, params.billingCycle, params.gateway);

    return this.computeProrationDelta({
      currentPrice,
      newPrice,
      currentBillingCycle: params.billingCycle,
      periodEnd: params.currentPeriodEnd,
    });
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

  private priceForCycle(
    plan: { priceCents: number; priceUsdCents: number; slug: string },
    cycle: BillingCycle,
    gateway: GatewayNameEnum,
  ): number {
    const unitCents = resolvePlanPriceCentsForGateway(plan, gateway);

    // Free plan has price 0 by design
    if (plan.slug === 'free') {
      return 0;
    }

    if (unitCents <= 0) {
      throw new BillingRuleException(`Plan price not configured for ${gateway === GatewayNameEnum.STRIPE ? 'Stripe' : 'Asaas'}`);
    }

    if (cycle === BillingCycle.YEARLY) {
      const annualPrice = (unitCents * 12 * 0.8) / 100;
      if (compareMoney(annualPrice, 0, PLAN_PRICE_SCALE) <= 0) {
        throw new BillingRuleException('Annual payment unavailable for this plan');
      }
      return annualPrice;
    }

    const monthlyPrice = unitCents / 100;
    if (compareMoney(monthlyPrice, 0, PLAN_PRICE_SCALE) < 0) {
      throw new BillingRuleException('Invalid monthly price for this plan');
    }

    return monthlyPrice;
  }
}
