import test from 'node:test';
import assert from 'node:assert/strict';
import { UpdateSubscriptionStrategyFactory } from '../../../dist/application/services/billing/strategies/update-subscription-strategy.factory.js';
import { SubscriptionChangeKind } from '../../../dist/domain/enums/billing.enums.js';
import { FREE_PLAN_ID, SubscriptionPlan } from '../../../dist/domain/enums/plans.enums.js';
import { BillingCycle } from '../../../dist/domain/enums/billing.enums.js';
import { GatewayNameEnum } from '../../../dist/infrastructure/billing/gateways/IPaymentGateway.js';

test('UpdateSubscriptionStrategyFactory returns NEW when activeSub is missing', () => {
  const factory = new UpdateSubscriptionStrategyFactory();

  // Case 1: activeSub is missing
  const ctxNoActiveSub = {
    userId: 'user-1',
    activeSub: undefined,
    newPlan: { id: 'pro-plan-id', slug: SubscriptionPlan.PRO, priceCents: 2000, priceUsdCents: 499 },
    newBillingCycle: BillingCycle.MONTHLY,
    gateway: GatewayNameEnum.ASAAS,
  };
  assert.equal(factory.getChangeKind(ctxNoActiveSub), SubscriptionChangeKind.NEW);
});

test('UpdateSubscriptionStrategyFactory returns UPGRADE/DOWNGRADE/CHANGE_CYCLE between paid plans', () => {
  const factory = new UpdateSubscriptionStrategyFactory();

  const activeSub = {
    id: 'user-1',
    planId: 'pro-plan-id',
    billingCycle: BillingCycle.MONTHLY,
    gatewaySubscriptionId: 'sub-123',
    nextDueDate: undefined,
    gatewayName: 'asaas',
  };

  const proPlan = { id: 'pro-plan-id', slug: SubscriptionPlan.PRO, priceCents: 2000, priceUsdCents: 499 };
  const enterprisePlan = { id: 'enterprise-plan-id', slug: SubscriptionPlan.ENTERPRISE, priceCents: 10000, priceUsdCents: 1999 };

  // Upgrade
  const ctxUpgrade = {
    userId: 'user-1',
    activeSub,
    activePlan: proPlan,
    newPlan: enterprisePlan,
    newBillingCycle: BillingCycle.MONTHLY,
    gateway: GatewayNameEnum.ASAAS,
  };
  assert.equal(factory.getChangeKind(ctxUpgrade), SubscriptionChangeKind.UPGRADE);

  // Downgrade
  const ctxDowngrade = {
    userId: 'user-1',
    activeSub,
    activePlan: enterprisePlan,
    newPlan: proPlan,
    newBillingCycle: BillingCycle.MONTHLY,
    gateway: GatewayNameEnum.ASAAS,
  };
  assert.equal(factory.getChangeKind(ctxDowngrade), SubscriptionChangeKind.DOWNGRADE);

  // Change Cycle
  const ctxChangeCycle = {
    userId: 'user-1',
    activeSub,
    activePlan: proPlan,
    newPlan: proPlan,
    newBillingCycle: BillingCycle.YEARLY,
    gateway: GatewayNameEnum.ASAAS,
  };
  assert.equal(factory.getChangeKind(ctxChangeCycle), SubscriptionChangeKind.CHANGE_CYCLE);
});

test('UpdateSubscriptionStrategyFactory uses USD prices for Stripe upgrades', () => {
  const factory = new UpdateSubscriptionStrategyFactory();

  const activeSub = {
    id: 'user-1',
    planId: 'pro-plan-id',
    billingCycle: BillingCycle.MONTHLY,
    gatewaySubscriptionId: 'sub_stripe',
    nextDueDate: undefined,
    gatewayName: 'stripe',
  };

  const proPlan = { id: 'pro-plan-id', slug: SubscriptionPlan.PRO, priceCents: 2000, priceUsdCents: 499 };
  const enterprisePlan = { id: 'enterprise-plan-id', slug: SubscriptionPlan.ENTERPRISE, priceCents: 10000, priceUsdCents: 1999 };

  const ctxUpgrade = {
    userId: 'user-1',
    activeSub,
    activePlan: proPlan,
    newPlan: enterprisePlan,
    newBillingCycle: BillingCycle.MONTHLY,
    gateway: GatewayNameEnum.STRIPE,
  };

  assert.equal(factory.getChangeKind(ctxUpgrade), SubscriptionChangeKind.UPGRADE);
});
