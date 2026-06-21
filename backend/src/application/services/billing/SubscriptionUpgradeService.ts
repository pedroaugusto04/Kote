import { Injectable, BadRequestException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { PostgresDatabase } from '../../../infrastructure/persistence/database.js';
import { plans } from '../../../infrastructure/persistence/schema/index.js';
import { BillingCycle } from '../../../domain/enums/billing.enums.js';
import { compareMoney, PLAN_PRICE_SCALE, toMoneyDecimal, toMoneyNumber } from '../../../infrastructure/utils/money.js';

type BillingValueInput = string | number | { toString(): string } | null | undefined;

@Injectable()
export class SubscriptionUpgradeService {
  constructor(
    private readonly database: PostgresDatabase,
  ) {}

  async calculateProrationUpgradeValue(params: {
    currentPlanId: string;
    newPlanId: string;
    billingCycle: BillingCycle;
    currentPeriodEnd: Date;
  }): Promise<number> {
    const db = this.database.getDb();

    const currentPlan = await db.select().from(plans).where(eq(plans.id, params.currentPlanId)).limit(1).then(r => r[0] || null);
    const newPlan = await db.select().from(plans).where(eq(plans.id, params.newPlanId)).limit(1).then(r => r[0] || null);

    if (!currentPlan || !newPlan) {
      throw new BadRequestException('Plan not found for proration calculation');
    }

    const currentPrice = this.priceForCycle(currentPlan, params.billingCycle);
    const newPrice = this.priceForCycle(newPlan, params.billingCycle);

    const deltaPrice = this.computeProrationDelta({
      currentPrice,
      newPrice,
      currentBillingCycle: params.billingCycle,
      periodEnd: params.currentPeriodEnd,
    });

    return deltaPrice > 0 ? deltaPrice : newPrice;
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
        throw new BadRequestException('Pagamento anual indisponível para este plano');
      }
      return annualPrice;
    }

    const monthlyPrice = plan.priceCents / 100;
    if (compareMoney(monthlyPrice, 0, PLAN_PRICE_SCALE) < 0) {
      throw new BadRequestException('Preço mensal inválido para este plano');
    }

    return monthlyPrice;
  }
}
