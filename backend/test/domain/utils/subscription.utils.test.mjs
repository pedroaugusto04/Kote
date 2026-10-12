import test from 'node:test';
import assert from 'node:assert/strict';
import { BillingCycle, SubscriptionStatus, PaymentStatus } from '../../../dist/domain/enums/billing.enums.js';
import {
  getNextDueDate,
  getQuotaPeriod,
  resolvePastDueTimestamp,
  resolveSubscriptionDueDate,
  calculateSubscriptionPeriodBounds,
} from '../../../dist/domain/utils/subscription.utils.js';

test('getNextDueDate advances one month on same day', () => {
  const activation = new Date(Date.UTC(2026, 0, 15, 12, 30, 0));
  const nextDue = getNextDueDate(activation, BillingCycle.MONTHLY);
  assert.equal(nextDue.toISOString(), '2026-02-15T00:00:00.000Z');
});

test('getNextDueDate clamps day when target month is shorter', () => {
  const activation = new Date(Date.UTC(2026, 0, 31));
  const nextDue = getNextDueDate(activation, BillingCycle.MONTHLY);
  assert.equal(nextDue.toISOString(), '2026-02-28T00:00:00.000Z');
});

test('getNextDueDate advances one year on same day', () => {
  const activation = new Date(Date.UTC(2024, 1, 29));
  const nextDue = getNextDueDate(activation, BillingCycle.YEARLY);
  assert.equal(nextDue.toISOString(), '2025-02-28T00:00:00.000Z');
});

test('getNextDueDate falls back to now for invalid activation date', () => {
  const invalid = new Date('invalid');
  const before = Date.now();
  const nextDue = getNextDueDate(invalid, BillingCycle.MONTHLY);
  const after = Date.now();
  assert.ok(nextDue.getTime() >= before);
  assert.ok(nextDue.getTime() <= after + 31 * 24 * 60 * 60 * 1000);
});

test('getQuotaPeriod monthly slicing for yearly plans', () => {
  const activeSub = {
    currentPeriodStart: '2026-03-15T00:00:00.000Z',
    currentPeriodEnd: '2027-03-15T00:00:00.000Z',
    billingCycle: BillingCycle.YEARLY,
    plan: { billingPeriod: BillingCycle.YEARLY }
  };

  // Case 1: Mid-period date
  const now1 = new Date('2026-07-03T10:00:00.000Z');
  const period1 = getQuotaPeriod(activeSub, now1);
  assert.equal(period1.start.toISOString(), '2026-06-15T00:00:00.000Z');
  assert.equal(period1.end.toISOString(), '2026-07-15T00:00:00.000Z');

  // Case 2: Boundary case (Jan 31st)
  const activeSubBound = {
    currentPeriodStart: '2026-01-31T00:00:00.000Z',
    currentPeriodEnd: '2027-01-31T00:00:00.000Z',
    billingCycle: BillingCycle.YEARLY,
  };
  const now2 = new Date('2026-02-15T00:00:00.000Z');
  const period2 = getQuotaPeriod(activeSubBound, now2);
  assert.equal(period2.start.toISOString(), '2026-01-31T00:00:00.000Z');
  assert.equal(period2.end.toISOString(), '2026-02-28T00:00:00.000Z');
});

test('resolvePastDueTimestamp handles status transitions', () => {
  const res1 = resolvePastDueTimestamp(SubscriptionStatus.PAST_DUE, SubscriptionStatus.ACTIVE);
  assert.ok(res1 instanceof Date);

  const res2 = resolvePastDueTimestamp(SubscriptionStatus.PAST_DUE, SubscriptionStatus.PAST_DUE);
  assert.equal(res2, undefined);

  const res3 = resolvePastDueTimestamp(SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE);
  assert.equal(res3, null);

  const res4 = resolvePastDueTimestamp(undefined, SubscriptionStatus.ACTIVE);
  assert.equal(res4, undefined);
});

test('resolveSubscriptionDueDate prefers earliest due date when payment is pending or overdue', () => {
  const paymentDue = new Date(Date.UTC(2026, 4, 10));
  const gatewayDue = new Date(Date.UTC(2026, 4, 15));

  const res1 = resolveSubscriptionDueDate({
    latestPaymentStatus: PaymentStatus.PENDING,
    latestPaymentDueDate: paymentDue,
    gatewayNextDueDate: gatewayDue,
  });
  assert.equal(res1?.toISOString(), paymentDue.toISOString());

  const res2 = resolveSubscriptionDueDate({
    latestPaymentStatus: PaymentStatus.PAID,
    latestPaymentDueDate: paymentDue,
    gatewayNextDueDate: gatewayDue,
  });
  assert.equal(res2?.toISOString(), gatewayDue.toISOString());
});

test('calculateSubscriptionPeriodBounds computes start and end for monthly and yearly cycles', () => {
  const nextDue = new Date(Date.UTC(2026, 5, 15));

  const monthlyBounds = calculateSubscriptionPeriodBounds(nextDue, BillingCycle.MONTHLY);
  assert.equal(monthlyBounds.currentPeriodEnd.toISOString(), '2026-06-15T00:00:00.000Z');
  assert.equal(monthlyBounds.currentPeriodStart.toISOString(), '2026-05-15T00:00:00.000Z');

  const yearlyBounds = calculateSubscriptionPeriodBounds(nextDue, BillingCycle.YEARLY);
  assert.equal(yearlyBounds.currentPeriodEnd.toISOString(), '2026-06-15T00:00:00.000Z');
  assert.equal(yearlyBounds.currentPeriodStart.toISOString(), '2025-06-15T00:00:00.000Z');
});


