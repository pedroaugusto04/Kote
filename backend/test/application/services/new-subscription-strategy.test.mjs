import test from 'node:test';
import assert from 'node:assert/strict';
import { SubscriptionService } from '../../../dist/application/services/billing/SubscriptionService.js';
import { SubscriptionChangeKind } from '../../../dist/domain/enums/billing.enums.js';
import { BillingCycle, BillingType } from '../../../dist/domain/enums/billing.enums.js';
import { GatewayNameEnum } from '../../../dist/infrastructure/billing/gateways/IPaymentGateway.js';

test('createNewSubscriptionPayment creates a pending charge without activating the subscription', async () => {
  let subscriptionUpserted = false;
  let savedPayment = null;

  const mockGateway = {
    createPayment: async () => ({
      id: 'pay-1',
      status: 'PENDING',
      netValue: 20,
      dueDate: new Date(),
    }),
  };

  const mockBillingPaymentRepository = {
    async upsertSubscriptionPayment(payment) {
      savedPayment = payment;
    },
    async getLatestPendingPaymentByUserId() {
      return savedPayment ? {
        id: savedPayment.id,
        value: savedPayment.value,
        status: savedPayment.status,
        billingType: savedPayment.billingType,
        dueDate: savedPayment.dueDate,
      } : null;
    },
  };

  const mockSubscriptionRepository = {
    async getSubscriptionByUserId() { return null; },
    async upsertUserSubscription() { subscriptionUpserted = true; },
  };

  const mockBillingCustomerRepository = {
    async getCustomerByUserId() { return null; },
  };

  const mockSubscriptionChangeService = {
    async getScheduledChange() { return null; },
  };

  const service = new SubscriptionService(
    { info: () => {}, warn: () => {}, error: () => {} },
    {
      createIntentAndExternalReference: async () => ({ externalReference: 'intent=1' }),
    },
    null,
    mockSubscriptionChangeService,
    mockGateway,
    null,
    { normalizePaymentStatus: () => 'pending' },
    null,
    mockBillingPaymentRepository,
    { getChangeKind: () => SubscriptionChangeKind.NEW },
    mockSubscriptionRepository,
    mockBillingCustomerRepository,
    null,
  );

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

  assert.equal(subscriptionUpserted, false);
  assert.ok(savedPayment);
  assert.equal(savedPayment.gatewayPaymentId, 'pay-1');
  assert.equal(savedPayment.status, 'pending');
  assert.equal(result.changeKind, SubscriptionChangeKind.NEW);
  assert.ok(result.summary?.latestPendingPayment);
});
