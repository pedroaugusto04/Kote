import test from 'node:test';
import assert from 'node:assert/strict';
import { SubscriptionService } from '../../../dist/application/services/billing/SubscriptionService.js';
import { BillingCycle, BillingType, SubscriptionStatus, PaymentStatus } from '../../../dist/domain/enums/billing.enums.js';

// Setup environment variables for test execution
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';

test('SubscriptionService throws when trying to subscribe to the same active plan/cycle/type', async () => {
  const planId = 'pro-plan-uuid';
  
  const mockPlan = {
    id: planId,
    slug: 'pro',
    displayName: 'Pro Plan',
    isActive: true,
    priceCents: 2000,
    priceUsdCents: 2000,
  };

  const mockSub = {
    userId: 'user-1',
    planId: planId,
    status: SubscriptionStatus.ACTIVE,
    billingCycle: 'monthly',
    billingType: 'credit_card',
  };

  const mockSubscriptionRepository = {
    async getPlanById(id) { return mockPlan; },
    async getSubscriptionByUserId(userId) { return mockSub; },
  };
  const mockUserRepository = {
    async findUserById(id) { return { cpfCnpj: '' }; },
    async updateUser() {},
  };
  const mockBillingCustomerRepository = {
    async getCustomerByUserId() { return null; },
    async upsertCustomer() {},
  };

  const service = new SubscriptionService(
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    { getChangeKind: () => 'NEW' },
    mockSubscriptionRepository,
    mockBillingCustomerRepository,
    mockUserRepository,
  );

  await assert.rejects(
    service.registerOrUpdateSubscription(
      'user-1',
      'user@example.com',
      'User',
      planId,
      BillingCycle.MONTHLY,
      BillingType.CREDIT_CARD,
      undefined,
      'US'
    ),
    (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /already subscribed to this plan/i);
      return true;
    }
  );
});
