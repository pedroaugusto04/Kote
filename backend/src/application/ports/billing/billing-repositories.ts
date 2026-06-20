import { PaymentGateway, PaymentStatus, PaymentKind, BillingType, BillingCycle, BillingIntentStatus } from '../../../infrastructure/persistence/schema/index.js';

export interface BillingCustomerRecord {
  id: string;
  userId: string;
  gateway: PaymentGateway;
  gatewayCustomerId: string;
  hasCreditCardOnFile: boolean;
  creditCardToken?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingPaymentRecord {
  id: string;
  subscriptionId?: string | null;
  userId: string;
  gateway: PaymentGateway;
  gatewayPaymentId: string;
  status: PaymentStatus;
  billingType?: BillingType | null;
  kind: PaymentKind;
  gatewayStatus?: string | null;
  value: number;
  dueDate: Date;
  paidAt?: Date | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  pixQrCode?: string | null;
  pixQrCodeUrl?: string | null;
  description?: string | null;
  lastGatewayEventAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingIntentRecord {
  id: string;
  type: 'new' | 'upgrade' | 'change_cycle';
  status: BillingIntentStatus;
  userId: string;
  planId?: string | null;
  subscriptionId?: string | null;
  billingCycle?: BillingCycle | null;
  creditCardToken?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GatewayWebhookEventRecord {
  id: string;
  gateway: PaymentGateway;
  dedupKey: string;
  eventType: string;
  gatewayEventId?: string | null;
  gatewayPaymentId?: string | null;
  gatewaySubscriptionId?: string | null;
  payload: any;
  status: 'pending' | 'processing' | 'done' | 'failed';
  attempts: number;
  lastError?: string | null;
  lastDispatchedAt?: Date | null;
  processedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSubscriptionRecord {
  userId: string;
  planId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  gatewayName: string;
  gatewaySubscriptionId?: string | null;
  gatewayCustomerId?: string | null;
  billingCycle: BillingCycle;
  billingType?: BillingType | null;
  nextDueDate?: Date | null;
  startedAt?: Date | null;
  pastDueAt?: Date | null;
  canceledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
}

export abstract class BillingWebhookEventRepository {
  abstract getWebhookEventById(id: string): Promise<GatewayWebhookEventRecord | null>;
  abstract markWebhookEventProcessing(id: string, maxAttempts: number): Promise<boolean>;
  abstract markWebhookEventDone(id: string): Promise<void>;
  abstract markWebhookEventFailed(id: string, error: string): Promise<void>;
  abstract markWebhookEventAlerted(id: string, alertMarker: string): Promise<void>;
}
