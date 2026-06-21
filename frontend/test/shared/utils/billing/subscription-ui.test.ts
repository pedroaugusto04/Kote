import { describe, expect, it } from 'vitest';

import { BILLING_TYPE } from '../../../../src/shared/constants/billing.constants';
import {
  canChooseManualMonthlyPayment,
  pendingChargeStatus,
  resolveEffectiveMonthlyBillingType,
} from '../../../../src/shared/utils/billing/subscription-ui';

describe('subscription-ui helpers', () => {
  it('forces credit card for monthly billing when a card is on file', () => {
    expect(
      resolveEffectiveMonthlyBillingType('monthly', true, BILLING_TYPE.PIX),
    ).toBe(BILLING_TYPE.CREDIT_CARD);
  });

  it('keeps selected billing type when no card is on file', () => {
    expect(
      resolveEffectiveMonthlyBillingType('monthly', false, BILLING_TYPE.PIX),
    ).toBe(BILLING_TYPE.PIX);
  });

  it('disables manual monthly payment when card is on file', () => {
    expect(canChooseManualMonthlyPayment(true)).toBe(false);
    expect(canChooseManualMonthlyPayment(false)).toBe(true);
  });

  it('treats pending and overdue as open charge statuses', () => {
    expect(pendingChargeStatus('pending')).toBe(true);
    expect(pendingChargeStatus('overdue')).toBe(true);
    expect(pendingChargeStatus('confirmed')).toBe(false);
  });
});
