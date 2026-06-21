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

  // Mock Database
  let queryIndex = 0;
  const mockDatabase = {
    getDb() {
      return {
        select() {
          return {
            from() {
              return {
                where() {
                  const currentIndex = queryIndex;
                  queryIndex++;
                  return {
                    limit() {
                      return {
                        async then(callback) {
                          if (currentIndex === 0) {
                            // Target plan query
                            return callback([mockPlan]);
                          } else if (currentIndex === 1) {
                            // Current subscription query
                            return callback([mockSub]);
                          } else if (currentIndex === 2) {
                            // User query (cpfCnpj)
                            return callback([{ cpfCnpj: '' }]);
                          } else if (currentIndex === 3) {
                            // Pending payment query (returns none)
                            return callback([]);
                          }
                          return callback([]);
                        }
                      };
                    }
                  };
                }
              };
            }
          };
        }
      };
    }
  };

  const service = new SubscriptionService(
    mockDatabase,
    null, // logger
    null, // asaasPaymentGateway
    null, // stripePaymentGateway
    null, // asaasGatewayStatusMapper
    null, // stripeGatewayStatusMapper
    null, // subscriptionUpgradeService
    null, // billingIntentService
    null  // subscriptionChangeService
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
