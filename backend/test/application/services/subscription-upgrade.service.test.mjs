import test from 'node:test';
import assert from 'node:assert/strict';
import { SubscriptionUpgradeService } from '../../../dist/application/services/billing/SubscriptionUpgradeService.js';
import { SubscriptionPlan } from '../../../dist/domain/enums/plans.enums.js';
import { BillingCycle, BillingType } from '../../../dist/domain/enums/billing.enums.js';
import { GatewayNameEnum } from '../../../dist/infrastructure/billing/gateways/IPaymentGateway.js';

test('SubscriptionUpgradeService prorates when upgrading between paid plans', async () => {
  const proPlan = {
    id: 'pro-plan-uuid',
    slug: SubscriptionPlan.PRO,
    displayName: 'Pro Plan',
    priceCents: 2000,
    priceUsdCents: 2000,
  };

  const enterprisePlan = {
    id: 'enterprise-plan-uuid',
    slug: SubscriptionPlan.ENTERPRISE,
    displayName: 'Enterprise Plan',
    priceCents: 10000,
    priceUsdCents: 10000,
  };

  const mockSubscriptionRepository = {
    async getPlanById(id) {
      if (id === 'pro-plan-uuid') return proPlan;
      if (id === 'enterprise-plan-uuid') return enterprisePlan;
      return null;
    },
  };

  const service = new SubscriptionUpgradeService(
    { getSubscriptionByGatewayId: async () => ({ nextDueDate: new Date().toISOString() }) },
    { getSubscriptionByGatewayId: async () => ({ nextDueDate: new Date().toISOString() }) },
    { error: () => {}, warn: () => {}, info: () => {} },
    mockSubscriptionRepository,
  );

  const periodEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000 + 10000);

  const value = await service.calculateProrationUpgradeValue({
    currentPlanId: 'pro-plan-uuid',
    newPlanId: 'enterprise-plan-uuid',
    billingCycle: BillingCycle.MONTHLY,
    currentPeriodEnd: periodEnd,
    gateway: GatewayNameEnum.ASAAS,
  });

  assert.equal(value, 40.0);
});

test('getUpgradeFirstPaymentValue requires a gateway subscription', async () => {
  const mockSubscriptionRepository = {
    async getPlanById() { return null; },
  };

  const service = new SubscriptionUpgradeService(
    { getSubscriptionByGatewayId: async () => null },
    { getSubscriptionByGatewayId: async () => null },
    { error: () => {}, warn: () => {}, info: () => {} },
    mockSubscriptionRepository,
  );

  await assert.rejects(
    () => service.getUpgradeFirstPaymentValue({
      userId: 'user-1',
      newPlan: {
        id: 'pro',
        slug: 'pro',
        displayName: 'Pro',
        priceCents: 2000,
        priceUsdCents: 2000,
        maxStorageBytes: 1,
        maxAiRequestsPerMonth: 1,
        maxWorkspaces: 1,
        maxProjectsPerWorkspace: 1,
        isActive: true,
      },
      newBillingCycle: BillingCycle.MONTHLY,
      newBillingType: BillingType.CREDIT_CARD,
      user: { id: 'user-1', name: 'User' },
      gateway: GatewayNameEnum.ASAAS,
      gatewayCustomerId: 'cust-1',
      activeSub: {
        id: 'user-1',
        planId: 'free',
        billingCycle: BillingCycle.MONTHLY,
        gatewaySubscriptionId: 'sub-1',
        gatewayName: 'asaas',
      },
      activePlan: {
        id: 'free',
        slug: 'free',
        displayName: 'Free',
        priceCents: 0,
        priceUsdCents: 0,
        maxStorageBytes: 1,
        maxAiRequestsPerMonth: 1,
        maxWorkspaces: 1,
        maxProjectsPerWorkspace: 1,
        isActive: true,
      },
      newSubscriptionValue: 20,
    }),
    /Unable to change subscription plan/,
  );
});
