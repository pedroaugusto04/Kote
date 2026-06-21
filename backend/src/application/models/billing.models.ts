import {
  type PaymentGateway,
  type PaymentStatus,
  type PaymentKind,
  type BillingType,
  type BillingCycle,
  type BillingIntentStatus,
} from '../../infrastructure/persistence/schema/index.js';

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
  stripeClientSecret?: string | null;
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

export interface WebhookEventCreateParams {
  gateway: PaymentGateway;
  dedupKey: string;
  eventType: string;
  gatewayEventId?: string | null;
  gatewayPaymentId?: string | null;
  gatewaySubscriptionId?: string | null;
  payload: any;
}

export interface WebhookEventCreateResult {
  id: string;
  created: boolean;
  status: 'pending' | 'processing' | 'done' | 'failed';
}
