import {
  type PaymentGateway as PaymentGatewayEnum,
  type PaymentStatus as PaymentStatusEnum,
  type PaymentKind as PaymentKindEnum,
  type BillingType as BillingTypeEnum,
  type BillingCycle as BillingCycleEnum,
  type BillingIntentStatus as BillingIntentStatusEnum,
} from '../../domain/enums/billing.enums.js';

export type PaymentGateway = 'asaas' | 'stripe' | PaymentGatewayEnum;
export type PaymentStatus =
  | 'pending'
  | 'received'
  | 'confirmed'
  | 'overdue'
  | 'refunded'
  | 'canceled'
  | 'partially_refunded'
  | PaymentStatusEnum;
export type PaymentKind = 'recurring' | 'upgrade' | PaymentKindEnum;
export type BillingType = 'credit_card' | 'pix' | 'boleto' | BillingTypeEnum;
export type BillingCycle = 'monthly' | 'yearly' | BillingCycleEnum;
export type BillingIntentStatus =
  | 'pending'
  | 'processing'
  | 'done'
  | 'failed'
  | 'canceled'
  | BillingIntentStatusEnum;

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
  payload: Record<string, unknown>;
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
  billingCycle: BillingCycle;
  billingType?: BillingType | null;
  nextDueDate?: Date | null;
  startedAt?: Date | null;
  pastDueAt?: Date | null;
  canceledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanRecord {
  id: string;
  slug: string;
  displayName: string;
  description?: string | null;
  priceCents: number;
  priceUsdCents: number;
  maxStorageBytes: number;
  maxAiCreditsPerMonth: number;
  maxWorkspaces: number;
  maxProjectsPerWorkspace: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SubscriptionChangeRequestRecord {
  id: string;
  userId: string;
  fromSubscriptionId?: string | null;
  fromGateway?: string | null;
  fromGatewaySubscriptionId?: string | null;
  toPlanId: string;
  toBillingCycle: string;
  toBillingType: string;
  type: string;
  status: string;
  effectiveAt: Date;
  appliedAt?: Date | null;
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
  payload: Record<string, unknown>;
}

export interface WebhookEventCreateResult {
  id: string;
  created: boolean;
  status: 'pending' | 'processing' | 'done' | 'failed';
}
