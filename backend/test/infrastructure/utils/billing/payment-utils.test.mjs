import test from 'node:test';
import assert from 'node:assert/strict';
import { canCancelPayment } from '../../../../dist/infrastructure/utils/billing/paymentUtils.js';
import { PaymentStatus } from '../../../../dist/domain/enums/billing.enums.js';

test('canCancelPayment allows only pending or overdue upgrade charges', () => {
  assert.equal(
    canCancelPayment({ status: PaymentStatus.PENDING, kind: 'upgrade' }),
    true,
  );
  assert.equal(
    canCancelPayment({ status: PaymentStatus.OVERDUE, kind: 'upgrade' }),
    true,
  );
  assert.equal(
    canCancelPayment({ status: PaymentStatus.PENDING, kind: 'recurring' }),
    false,
  );
  assert.equal(
    canCancelPayment({ status: PaymentStatus.CONFIRMED, kind: 'upgrade' }),
    false,
  );
});
