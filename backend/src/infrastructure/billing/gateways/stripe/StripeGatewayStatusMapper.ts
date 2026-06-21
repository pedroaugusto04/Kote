import { Injectable } from '@nestjs/common';
import { IGatewayStatusMapper } from '../IGatewayStatusMapper.js';
import { PaymentStatus } from '../../../persistence/schema/index.js';

@Injectable()
export class StripeGatewayStatusMapper implements IGatewayStatusMapper {
  normalizeSubscriptionStatus(raw?: string | null): string | null {
    const s = String(raw ?? '').toLowerCase();
    switch (s) {
      case 'active':
        return 'active';
      case 'incomplete':
        return 'pending';
      case 'incomplete_expired':
        return 'canceled';
      case 'past_due':
        return 'past_due';
      case 'canceled':
      case 'unpaid':
        return 'canceled';
      default:
        return null;
    }
  }

  normalizePaymentStatus(rawStatus?: string | null, event?: string | null): PaymentStatus | null {
    const s = String(rawStatus ?? '').toLowerCase();
    const e = String(event ?? '').toLowerCase();

    if (e.includes('charge.refunded') || e.includes('charge.refund.updated')) {
      return 'refunded';
    }

    switch (s) {
      case 'succeeded':
      case 'paid':
        return 'confirmed';

      case 'pending':
      case 'processing':
      case 'requires_action':
      case 'requires_confirmation':
      case 'requires_capture':
      case 'requires_payment_method':
        return 'pending';

      case 'open':
      case 'draft':
        return 'pending';

      case 'failed':
      case 'canceled':
      case 'void':
        return 'canceled';

      case 'refunded':
        return 'refunded';

      case 'partially_refunded':
        return 'partially_refunded';

      case 'uncollectible':
        return 'overdue';

      default:
        return null;
    }
  }
}
