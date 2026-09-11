import type { SubscriptionChangeKind, BillingCycle, BillingType } from '../../domain/enums/billing.enums.js';

export interface RegisterOrUpdateSubscriptionInput {
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

export interface SubscriptionChangeResult {
  summary: unknown;
  changeKind: SubscriptionChangeKind;
}

