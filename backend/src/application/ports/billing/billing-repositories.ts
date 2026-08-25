import { type PaymentGateway } from '../../../infrastructure/persistence/schema/index.js';
import {
  type BillingCustomerRecord,
  type BillingPaymentRecord,
  type GatewayWebhookEventRecord,
  type WebhookEventCreateParams,
  type WebhookEventCreateResult,
  type PlanRecord,
  type UserSubscriptionRecord,
  type SubscriptionChangeRequestRecord,
} from '../../models/billing.models.js';

export abstract class SubscriptionRepository {
  abstract getActivePlans(): Promise<PlanRecord[]>;
  abstract getPlanById(id: string): Promise<PlanRecord | null>;
  abstract getPlanBySlug(slug: string): Promise<PlanRecord | null>;
  abstract getSubscriptionByUserId(userId: string): Promise<UserSubscriptionRecord | null>;
  abstract getSubscriptionByGatewaySubscriptionId(gatewaySubscriptionId: string): Promise<UserSubscriptionRecord | null>;
  abstract getSubscriptionByCreatedFromIntentId(userId: string, intentId: string): Promise<UserSubscriptionRecord | null>;
  abstract upsertUserSubscription(userId: string, data: Partial<UserSubscriptionRecord>): Promise<UserSubscriptionRecord>;
  abstract createSubscriptionChangeRequest(data: Omit<SubscriptionChangeRequestRecord, 'createdAt' | 'updatedAt'>): Promise<SubscriptionChangeRequestRecord>;
  abstract getScheduledChangeRequest(userId: string, type: string): Promise<SubscriptionChangeRequestRecord | null>;
  abstract updateSubscriptionChangeRequestStatus(id: string, status: string, options?: { appliedAt?: Date; canceledAt?: Date }): Promise<void>;
}

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
  abstract hasRecurringPaymentInRealDebt(userId: string, subscriptionId?: string): Promise<boolean>;
  abstract getLatestPendingPaymentByUserId(userId: string): Promise<BillingPaymentRecord | null>;
  abstract getPaymentById(id: string): Promise<BillingPaymentRecord | null>;
  abstract getOpenPaymentsByUserId(userId: string): Promise<BillingPaymentRecord[]>;
  abstract updatePaymentStatus(id: string, status: string): Promise<void>;
}

export abstract class BillingWebhookEventRepository {
  abstract getWebhookEventById(id: string): Promise<GatewayWebhookEventRecord | null>;
  abstract createWebhookEventOnce(params: WebhookEventCreateParams): Promise<WebhookEventCreateResult>;
  abstract markWebhookEventProcessing(id: string, maxAttempts: number): Promise<boolean>;
  abstract markWebhookEventDone(id: string): Promise<void>;
  abstract markWebhookEventFailed(id: string, error: string): Promise<void>;
  abstract markWebhookEventAlerted(id: string, alertMarker: string): Promise<void>;
}

export interface BillingIntentRecord {
  id: string;
  type: string;
  status: string;
  userId: string;
  planId: string;
  subscriptionId?: string | null;
  billingCycle: string;
  creditCardToken?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export abstract class BillingIntentRepository {
  abstract getIntentById(intentId: string): Promise<BillingIntentRecord | null>;
  abstract getPendingOneShotIntentByUserId(userId: string): Promise<BillingIntentRecord | null>;
  abstract createIntent(data: Omit<BillingIntentRecord, 'createdAt' | 'updatedAt'>): Promise<BillingIntentRecord>;
  abstract claimForProcessing(userId: string, intentId: string): Promise<boolean>;
  abstract updateIntentStatus(intentId: string, status: string, options?: { subscriptionId?: string }): Promise<void>;
  abstract cancelLatestPendingOneShotIntent(userId: string): Promise<void>;
}
