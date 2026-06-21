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

type MergeablePendingPayment = {
  id: string;
  pixQrCode?: string | null;
  pixQrCodeUrl?: string | null;
  bankSlipUrl?: string | null;
  invoiceUrl?: string | null;
  stripeClientSecret?: string | null;
};

export function mergePendingPayment<T extends MergeablePendingPayment>(
  current: T | null,
  incoming: T,
): T {
  if (!current || current.id !== incoming.id) {
    return incoming;
  }

  return {
    ...incoming,
    pixQrCode: incoming.pixQrCode ?? current.pixQrCode ?? null,
    pixQrCodeUrl: incoming.pixQrCodeUrl ?? current.pixQrCodeUrl ?? null,
    bankSlipUrl: incoming.bankSlipUrl ?? current.bankSlipUrl ?? null,
    invoiceUrl: incoming.invoiceUrl ?? current.invoiceUrl ?? null,
    stripeClientSecret: incoming.stripeClientSecret ?? current.stripeClientSecret ?? null,
  };
}
