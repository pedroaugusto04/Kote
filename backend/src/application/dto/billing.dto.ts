import { BillingCycle, BillingType, SubscriptionChangeType } from '../../domain/enums/billing.enums.js';

export interface PlanDto {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  annualPrice: number;
  priceUsd: number;
  annualPriceUsd: number;
  maxStorageBytes: number;
  maxAiCreditsPerMonth: number;
  maxWorkspaces: number;
  maxProjectsPerWorkspace: number;
  isDefault: boolean;
  isVisible: boolean;
}

export interface RegisterSubscriptionDto {
  userId: string;
  userEmail: string;
  userDisplayName: string | null;
  planId: string;
  billingCycle?: BillingCycle;
  billingType?: BillingType;
  cpfCnpj?: string;
  countryCode?: string;
  creditCardToken?: string;
}

export interface CreateFirstSubscriptionDto {
  userId: string;
  targetPlanId: string;
  gatewayCustomerId: string;
  billingCycle: BillingCycle;
  billingType?: BillingType;
  activationDate?: Date;
  creditCardToken?: string;
  createdFromIntentId?: string;
  gatewayName?: string;
}

export interface ScheduleSubscriptionChangeDto {
  userId: string;
  fromSubscriptionId: string;
  fromGateway: string;
  fromGatewaySubscriptionId: string;
  toPlanId: string;
  toBillingCycle: BillingCycle;
  toBillingType: BillingType;
  type: SubscriptionChangeType;
  effectiveAt: Date;
}

export interface PendingPaymentSummaryDto {
  id: string;
  subscriptionId?: string | null;
  userId: string;
  gateway: string;
  gatewayPaymentId: string;
  status: string;
  billingType?: string | null;
  kind: string;
  value: number;
  dueDate: string;
  bankSlipUrl?: string | null;
  pixQrCode?: string | null;
  pixQrCodeUrl?: string | null;
  invoiceUrl?: string | null;
  stripeClientSecret?: string | null;
  canCancel: boolean;
}

export interface SubscriptionStatusSummaryDto {
  latestSubSummary: {
    userId: string;
    planId: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    billingCycle: string;
    billingType: string;
    nextDueDate: string | null;
    gatewayName: string;
  } | null;
  activeSubSummary: {
    userId: string;
    planId: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    billingCycle: string;
    billingType: string;
    nextDueDate: string | null;
    gatewayName: string;
  } | null;
  latestPendingPaymentSummary: PendingPaymentSummaryDto | null;
  hasCreditCardOnFile: boolean;
  scheduledChange: {
    id: string;
    userId: string;
    fromSubscriptionId: string;
    toPlanId: string;
    toPlan: PlanDto | null;
    toBillingCycle: string;
    toBillingType: string;
    type: string;
    effectiveAt: string;
  } | null;
}
