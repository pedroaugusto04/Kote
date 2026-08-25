import { BillingCycle, GatewayNameEnum } from '../enums/billing.enums.js';


export type PlanPriceFields = {
  priceCents: number;
  priceUsdCents: number;
};

export function resolvePlanPriceCentsForGateway(
  plan: PlanPriceFields,
  gateway: GatewayNameEnum,
): number {
  return gateway === GatewayNameEnum.ASAAS ? plan.priceCents : plan.priceUsdCents;
}

export function resolvePlanValueForCycle(
  plan: PlanPriceFields,
  cycle: BillingCycle,
  gateway: GatewayNameEnum,
): number {
  const priceCents = resolvePlanPriceCentsForGateway(plan, gateway);
  if (cycle === BillingCycle.YEARLY) {
    return (priceCents * 12 * 0.8) / 100;
  }
  return priceCents / 100;
}
