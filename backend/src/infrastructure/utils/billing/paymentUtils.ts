import { PaymentStatus } from '../../../domain/enums/billing.enums.js';
import type { PaymentKind } from '../../persistence/schema/index.js';

export function canCancelPayment(payment: {
  status: string;
  kind: PaymentKind | string;
}): boolean {
  return (
    (payment.status === PaymentStatus.PENDING || payment.status === PaymentStatus.OVERDUE) &&
    payment.kind === 'upgrade'
  );
}
