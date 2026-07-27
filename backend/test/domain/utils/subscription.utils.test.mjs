import test from 'node:test';
import assert from 'node:assert/strict';
import { BillingCycle } from '../../../dist/domain/enums/billing.enums.js';
import { getNextDueDate, getQuotaPeriod } from '../../../dist/domain/utils/subscription.utils.js';

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

