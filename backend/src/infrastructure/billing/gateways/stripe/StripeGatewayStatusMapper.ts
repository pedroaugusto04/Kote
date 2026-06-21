import { Injectable } from '@nestjs/common';
import { PaymentStatus } from '../../../persistence/schema/index.js';

export interface IGatewayStatusMapper {
  normalizeSubscriptionStatus(raw?: string | null): string | null;
  normalizePaymentStatus(rawStatus?: string | null, event?: string | null): PaymentStatus | null;
}

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
      case 'trialing':
        return 'trialing';
      default:
        return null;
    }
  }

  normalizePaymentStatus(rawStatus?: string | null, event?: string | null): PaymentStatus | null {
    const s = String(rawStatus ?? '').toLowerCase();
    const e = String(event ?? '').toLowerCase();

    if (e.includes('charge.refunded') || e.includes('charge.refund')) {
      return 'refunded';
    }

    switch (s) {
      case 'succeeded':
      case 'paid':
        return 'confirmed';

      case 'pending':
      case 'processing':
        return 'pending';

      case 'failed':
      case 'canceled':
        return 'canceled';

      case 'refunded':
      case 'partially_refunded':
        return 'refunded';

      default:
        return null;
    }
  }
}
