import { type PaymentGateway } from '../../../infrastructure/persistence/schema/index.js';
import {
  type BillingCustomerRecord,
  type BillingPaymentRecord,
  type GatewayWebhookEventRecord,
} from '../../models/billing.models.js';

export abstract class BillingCustomerRepository {
  abstract getCustomerByGatewayId(gateway: PaymentGateway, gatewayCustomerId: string): Promise<BillingCustomerRecord | null>;
  abstract getCustomerByUserId(userId: string, gateway: PaymentGateway): Promise<BillingCustomerRecord | null>;
  abstract getCreditCardToken(userId: string, gateway: PaymentGateway): Promise<string | null>;
  abstract markCreditCardOnFile(userId: string, gateway: PaymentGateway, token: string): Promise<void>;
  abstract getGatewayCustomerId(userId: string, gateway: PaymentGateway): Promise<string>;
  abstract upsertCustomer(userId: string, gateway: PaymentGateway, gatewayCustomerId: string): Promise<BillingCustomerRecord>;
}

export abstract class BillingPaymentRepository {
  abstract getSubscriptionPaymentByGatewayPaymentId(gateway: PaymentGateway, gatewayPaymentId: string): Promise<BillingPaymentRecord | null>;
  abstract updateSubscriptionPaymentByGatewayId(
    gateway: PaymentGateway,
    gatewayPaymentId: string,
    data: Partial<Omit<BillingPaymentRecord, 'id' | 'createdAt' | 'updatedAt'>> & {
      onlyIfLastGatewayEventAtLte?: Date;
    }
  ): Promise<boolean>;
  abstract upsertSubscriptionPayment(
    data: Omit<BillingPaymentRecord, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    }
  ): Promise<BillingPaymentRecord>;
}

export abstract class BillingWebhookEventRepository {
  abstract getWebhookEventById(id: string): Promise<GatewayWebhookEventRecord | null>;
  abstract markWebhookEventProcessing(id: string, maxAttempts: number): Promise<boolean>;
  abstract markWebhookEventDone(id: string): Promise<void>;
  abstract markWebhookEventFailed(id: string, error: string): Promise<void>;
  abstract markWebhookEventAlerted(id: string, alertMarker: string): Promise<void>;
}
