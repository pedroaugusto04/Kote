import { Injectable } from '@nestjs/common';
import { IGatewayStatusMapper } from '../IGatewayStatusMapper.js';
import { PaymentStatus } from '../../../persistence/schema/index.js';

@Injectable()
export class AsaasGatewayStatusMapper implements IGatewayStatusMapper {
  normalizeSubscriptionStatus(raw?: string | null): string | null {
    const s = String(raw ?? '').toUpperCase();
    switch (s) {
      case 'ACTIVE':
        return 'active';
      case 'INACTIVE':
        return 'inactive';
      case 'DELETED':
      case 'CANCELED':
        return 'canceled';
      default:
        return null;
    }
  }

  normalizePaymentStatus(rawStatus?: string | null, event?: string | null): PaymentStatus | null {
    const s = String(rawStatus ?? '').toUpperCase();
    const e = String(event ?? '').toUpperCase();

    if (e.includes('DELETE') || e.includes('CANCEL')) {
      return 'canceled';
      }
    if (e.includes('REFUND') || e.includes('CHARGEBACK')) {
      return 'refunded';
    }

    switch (s) {
      case 'RECEIVED':
      case 'RECEIVED_IN_CASH':
        return 'received';

      case 'CONFIRMED':
        return 'confirmed';

      case 'PENDING':
        return 'pending';

      case 'OVERDUE':
        return 'overdue';

      case 'REFUNDED':
      case 'REFUND_REQUESTED':
      case 'REFUND_IN_PROGRESS':
        return 'refunded';

      case 'PARTIALLY_REFUNDED':
        return 'partially_refunded';

      case 'CHARGEBACK_REQUESTED':
      case 'CHARGEBACK_DISPUTE':
      case 'AWAITING_CHARGEBACK_REVERSAL':
        return 'refunded';

      case 'DELETED':
      case 'CANCELED':
        return 'canceled';

      default:
        return null;
    }
  }
}
