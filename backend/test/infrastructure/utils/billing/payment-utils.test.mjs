import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCancelPayment,
  getPendingPaymentPriority,
  pickHighestPriorityPendingPayment,
} from '../../../../dist/infrastructure/utils/billing/paymentUtils.js';
import { PaymentStatus } from '../../../../dist/domain/enums/billing.enums.js';

test('canCancelPayment allows only pending or overdue upgrade charges', () => {
  assert.equal(canCancelPayment({ status: PaymentStatus.PENDING, kind: 'upgrade' }), true);
  assert.equal(canCancelPayment({ status: PaymentStatus.PENDING, kind: 'recurring' }), false);
});

test('getPendingPaymentPriority prefers overdue recurring debt over upgrade charges', () => {
  const today = new Date('2026-06-21T12:00:00.000Z');

  assert.equal(
    getPendingPaymentPriority(
      { kind: 'recurring', status: PaymentStatus.OVERDUE, dueDate: new Date('2026-06-01') },
      today,
    ),
    0,
  );
  assert.equal(
    getPendingPaymentPriority(
      { kind: 'upgrade', status: PaymentStatus.PENDING, dueDate: new Date('2026-06-22') },
      today,
    ),
    1,
  );
  assert.equal(
    getPendingPaymentPriority(
      { kind: 'recurring', status: PaymentStatus.PENDING, dueDate: new Date('2026-07-01') },
      today,
    ),
    2,
  );
});

test('pickHighestPriorityPendingPayment selects overdue recurring over upgrade', () => {
  const today = new Date('2026-06-21T12:00:00.000Z');
  const selected = pickHighestPriorityPendingPayment([
    {
      id: 'upgrade',
      kind: 'upgrade',
      status: PaymentStatus.PENDING,
      dueDate: new Date('2026-06-22'),
      createdAt: new Date('2026-06-20'),
    },
    {
      id: 'recurring-overdue',
      kind: 'recurring',
      status: PaymentStatus.OVERDUE,
      dueDate: new Date('2026-06-01'),
      createdAt: new Date('2026-06-01'),
    },
  ], today);

  assert.equal(selected?.id, 'recurring-overdue');
});
