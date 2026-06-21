import { PaymentStatus } from '../../../domain/enums/billing.enums.js';
import type { PaymentKind } from '../../persistence/schema/index.js';

export type PendingPaymentCandidate = {
  kind: PaymentKind | string;
  status: string;
  dueDate: Date;
  createdAt: Date;
};

export function canCancelPayment(payment: {
  status: string;
  kind: PaymentKind | string;
}): boolean {
  return (
    (payment.status === PaymentStatus.PENDING || payment.status === PaymentStatus.OVERDUE) &&
    payment.kind === 'upgrade'
  );
}

export function getPendingPaymentPriority(
  payment: Pick<PendingPaymentCandidate, 'kind' | 'status' | 'dueDate'>,
  today: Date,
): number {
  const dueDate = payment.dueDate instanceof Date ? payment.dueDate : new Date(payment.dueDate);

  if (
    payment.kind === 'recurring' &&
    (payment.status === PaymentStatus.OVERDUE ||
      (payment.status === PaymentStatus.PENDING && dueDate <= today))
  ) {
    return 0;
  }

  if (
    payment.kind === 'upgrade' &&
    (payment.status === PaymentStatus.PENDING || payment.status === PaymentStatus.OVERDUE)
  ) {
    return 1;
  }

  if (
    payment.kind === 'recurring' &&
    payment.status === PaymentStatus.PENDING &&
    dueDate > today
  ) {
    return 2;
  }

  return 3;
}

export function shouldReplacePendingPaymentCandidate(
  candidate: PendingPaymentCandidate,
  current: PendingPaymentCandidate,
  today: Date,
): boolean {
  const candidatePriority = getPendingPaymentPriority(candidate, today);
  const currentPriority = getPendingPaymentPriority(current, today);

  if (candidatePriority !== currentPriority) {
    return candidatePriority < currentPriority;
  }

  const candidateDueDateTime = candidate.dueDate.getTime();
  const currentDueDateTime = current.dueDate.getTime();
  if (candidateDueDateTime !== currentDueDateTime) {
    return candidateDueDateTime > currentDueDateTime;
  }

  return candidate.createdAt.getTime() > current.createdAt.getTime();
}

export function pickHighestPriorityPendingPayment<T extends PendingPaymentCandidate>(
  payments: T[],
  today: Date = new Date(),
): T | null {
  if (payments.length === 0) {
    return null;
  }

  let selected = payments[0];
  for (let index = 1; index < payments.length; index += 1) {
    const candidate = payments[index];
    if (shouldReplacePendingPaymentCandidate(candidate, selected, today)) {
      selected = candidate;
    }
  }

  return selected;
}

export function isActiveSubscriptionStatus(status: string): boolean {
  return status === 'active' || status === 'past_due';
}
