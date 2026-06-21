import { BILLING_TYPE, SUBSCRIPTION_STATUS } from '../../constants/billing.constants';

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  OVERDUE: 'overdue',
} as const;

export function isOpenSubscriptionStatus(status?: string): boolean {
  return (
    status === SUBSCRIPTION_STATUS.PENDING ||
    status === SUBSCRIPTION_STATUS.ACTIVE ||
    status === SUBSCRIPTION_STATUS.PAST_DUE
  );
}

export function pendingChargeStatus(status: string): boolean {
  return status === PAYMENT_STATUS.PENDING || status === PAYMENT_STATUS.OVERDUE;
}

export function toUtcDateOnlyTimestamp(value: string | Date): number | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function isManualBillingType(billingType?: string | null): boolean {
  return billingType === BILLING_TYPE.PIX || billingType === BILLING_TYPE.BOLETO;
}

export function resolveEffectiveMonthlyBillingType(
  billingCycle: string,
  hasCreditCardOnFile: boolean,
  selectedBillingType: string,
): string {
  if (billingCycle === 'monthly' && hasCreditCardOnFile) {
    return BILLING_TYPE.CREDIT_CARD;
  }
  return selectedBillingType;
}

export function canChooseManualMonthlyPayment(hasCreditCardOnFile: boolean): boolean {
  return !hasCreditCardOnFile;
}
