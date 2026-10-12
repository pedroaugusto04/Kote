import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBillingGateway,
  validateSubscriptionPreconditions,
  validatePaymentMethodRegistration,
} from '../../../dist/application/services/billing/subscription-registration.helpers.js';
import {
  BillingCycle,
  BillingType,
  SubscriptionStatus,
} from '../../../dist/domain/enums/billing.enums.js';
import {
  PAYMENT_GATEWAY,
  COUNTRY_CODE,
} from '../../../dist/domain/constants/billing.constants.js';

test('resolveBillingGateway resolves correctly based on countryCode and ONLY_STRIPE', () => {
  const origOnlyStripe = process.env.ONLY_STRIPE;

  try {
    delete process.env.ONLY_STRIPE;

    const brazilRes = resolveBillingGateway('BR');
    assert.equal(brazilRes.isBrazil, true);
    assert.equal(brazilRes.isInternational, false);
    assert.equal(brazilRes.gatewayName, PAYMENT_GATEWAY.ASAAS);

    const usRes = resolveBillingGateway('US');
    assert.equal(usRes.isBrazil, false);
    assert.equal(usRes.isInternational, true);
    assert.equal(usRes.gatewayName, PAYMENT_GATEWAY.STRIPE);

    process.env.ONLY_STRIPE = 'true';
    const forcedStripeRes = resolveBillingGateway('BR');
    assert.equal(forcedStripeRes.isBrazil, true);
    assert.equal(forcedStripeRes.isInternational, true);
    assert.equal(forcedStripeRes.gatewayName, PAYMENT_GATEWAY.STRIPE);
  } finally {
    if (origOnlyStripe !== undefined) {
      process.env.ONLY_STRIPE = origOnlyStripe;
    } else {
      delete process.env.ONLY_STRIPE;
    }
  }
});

test('validateSubscriptionPreconditions rejects invalid payment methods for international users', () => {
  assert.throws(
    () => {
      validateSubscriptionPreconditions({
        countryCode: 'US',
        type: BillingType.PIX,
        cycle: BillingCycle.MONTHLY,
        currentSub: null,
        planId: 'plan-1',
      });
    },
    /PIX and Boleto payments are only available for Brazilian users/i,
  );
});

test('validateSubscriptionPreconditions rejects past due subscription', () => {
  const origKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'mock_key';

  try {
    assert.throws(
      () => {
        validateSubscriptionPreconditions({
          countryCode: 'US',
          type: BillingType.CREDIT_CARD,
          cycle: BillingCycle.MONTHLY,
          currentSub: {
            planId: 'plan-1',
            status: SubscriptionStatus.PAST_DUE,
            billingCycle: BillingCycle.MONTHLY,
          },
          planId: 'plan-2',
        });
      },
      /Your subscription has a past due payment/i,
    );
  } finally {
    if (origKey !== undefined) {
      process.env.STRIPE_SECRET_KEY = origKey;
    } else {
      delete process.env.STRIPE_SECRET_KEY;
    }
  }
});

test('validateSubscriptionPreconditions rejects subscribing to identical active plan and cycle', () => {
  const origKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'mock_key';

  try {
    assert.throws(
      () => {
        validateSubscriptionPreconditions({
          countryCode: 'US',
          type: BillingType.CREDIT_CARD,
          cycle: BillingCycle.MONTHLY,
          currentSub: {
            planId: 'plan-1',
            status: SubscriptionStatus.ACTIVE,
            billingCycle: BillingCycle.MONTHLY,
          },
          planId: 'plan-1',
        });
      },
      /You are already subscribed to this plan with the same billing cycle/i,
    );
  } finally {
    if (origKey !== undefined) {
      process.env.STRIPE_SECRET_KEY = origKey;
    } else {
      delete process.env.STRIPE_SECRET_KEY;
    }
  }
});

test('validatePaymentMethodRegistration enforces card requirements', () => {
  // Monthly non-credit-card with card on file
  assert.throws(
    () => {
      validatePaymentMethodRegistration({
        countryCode: 'BR',
        type: BillingType.BOLETO,
        cycle: BillingCycle.MONTHLY,
        isFreePlan: false,
        hasCreditCardOnFile: true,
      });
    },
    /With a registered card, monthly subscriptions must use credit card/i,
  );

  // International credit card without card on file and without token
  assert.throws(
    () => {
      validatePaymentMethodRegistration({
        countryCode: 'US',
        type: BillingType.CREDIT_CARD,
        cycle: BillingCycle.MONTHLY,
        isFreePlan: false,
        hasCreditCardOnFile: false,
        normalizedCreditCardToken: undefined,
      });
    },
    /Credit card details are required for international subscriptions/i,
  );

  // Valid international registration passes
  assert.doesNotThrow(() => {
    validatePaymentMethodRegistration({
      countryCode: 'US',
      type: BillingType.CREDIT_CARD,
      cycle: BillingCycle.MONTHLY,
      isFreePlan: false,
      hasCreditCardOnFile: false,
      normalizedCreditCardToken: 'tok_123',
    });
  });
});
