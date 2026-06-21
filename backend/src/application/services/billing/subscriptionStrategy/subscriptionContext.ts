import { BillingCycle, BillingType } from '../../../../domain/enums/billing.enums.js';
import { GatewayNameEnum } from '../../../../infrastructure/billing/gateways/IPaymentGateway.js';

export interface SubscriptionPlanDTO {
  id: string;
  slug: string;
  displayName: string;
  priceCents: number;
  priceUsdCents: number;
  maxStorageBytes: number;
  maxAiRequestsPerMonth: number;
  maxWorkspaces: number;
  maxProjectsPerWorkspace: number;
  isActive: boolean;
}

export interface SubscriptionDTO {
  planId: string;
  billingCycle: BillingCycle;
  billingType: BillingType;
  creditCardToken?: string;
}

export type SubscriptionContext = {
  userId: string;
  newSubscriptionDTO: SubscriptionDTO;

  newPlan: SubscriptionPlanDTO;
  newBillingCycle: BillingCycle;
  newBillingType: BillingType;
  newCreditCardToken?: string;
  newSubscriptionValue: number;

  user: { id: string; name: string };

  gateway: GatewayNameEnum;
  gatewayCustomerId: string;

  latestSub?: {
    id: string;
    planId: string;
    billingCycle: BillingCycle;
    gatewaySubscriptionId: string;
    nextDueDate?: Date;
  };

  activeSub?: {
    id: string;
    planId: string;
    billingCycle: BillingCycle;
    gatewaySubscriptionId: string;
    nextDueDate?: Date;
    gatewayName: string;
  };

  activePlan?: SubscriptionPlanDTO;
};
