import test from 'node:test';
import assert from 'node:assert/strict';
import { SubscriptionService } from '../../../dist/application/services/billing/SubscriptionService.js';
import { SubscriptionChangeKind } from '../../../dist/domain/enums/billing.enums.js';
import { BillingCycle, BillingType } from '../../../dist/domain/enums/billing.enums.js';
import { GatewayNameEnum } from '../../../dist/infrastructure/billing/gateways/IPaymentGateway.js';

test('createNewSubscriptionPayment creates a pending charge without activating the subscription', async () => {
  let createSubscriptionCalled = false;
  let paymentCreated = false;

  const mockGateway = {
    createPayment: async () => ({
      id: 'pay-1',
      status: 'PENDING',
    }),
  };

  const mockBillingPaymentRepository = {
    async upsertSubscriptionPayment() {
      paymentCreated = true;
    },
  };

  const service = new SubscriptionService(
    { info: () => {}, warn: () => {}, error: () => {} },
    {
      createIntentAndExternalReference: async () => ({ externalReference: 'intent=1' }),
    },
    null,
    null,
    mockGateway,
    null,
    { normalizePaymentStatus: () => 'pending' },
    null,
    mockBillingPaymentRepository,
    { getChangeKind: () => SubscriptionChangeKind.NEW },
    null,
    null,
    null,
  );

  service.createNewSubscription = async () => {
    createSubscriptionCalled = true;
    return { id: 'sub-1' };
  };
  service.getSubscriptionStatusSummary = async () => ({
    entitledPlanId: 'free-plan-id',
    latestPendingPayment: { id: 'pay-1', value: 20 },
  });

  const result = await service.createNewSubscriptionPayment({
    userId: 'user-1',
    newPlan: {
      id: 'pro-plan-id',
      slug: 'pro',
      displayName: 'Pro Plan',
      priceCents: 2000,
      priceUsdCents: 2000,
      maxStorageBytes: 1000,
      maxAiRequestsPerMonth: 100,
      maxWorkspaces: 3,
      maxProjectsPerWorkspace: 10,
      isActive: true,
    },
    newBillingCycle: BillingCycle.MONTHLY,
    newBillingType: BillingType.CREDIT_CARD,
    user: { id: 'user-1', name: 'User' },
    gateway: GatewayNameEnum.ASAAS,
    gatewayCustomerId: 'cust-1',
  });

  assert.equal(createSubscriptionCalled, false);
  assert.equal(paymentCreated, true);
  assert.equal(result.changeKind, SubscriptionChangeKind.NEW);
  assert.ok(result.summary?.latestPendingPayment);
});
