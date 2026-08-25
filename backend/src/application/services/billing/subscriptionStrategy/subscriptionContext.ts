import { BillingCycle, BillingType, GatewayNameEnum } from '../../../../domain/enums/billing.enums.js';

export interface SubscriptionPlanDTO {
  id: string;
  slug: string;
  displayName: string;
  priceCents: number;
  priceUsdCents: number;
  maxStorageBytes: number;
  maxAiCreditsPerMonth: number;
  maxWorkspaces: number;
  maxProjectsPerWorkspace: number;
  isActive: boolean;
}

export type SubscriptionContext = {
  userId: string;
  newPlan: SubscriptionPlanDTO;
  newBillingCycle: BillingCycle;
  newBillingType: BillingType;
  newCreditCardToken?: string;
  newSubscriptionValue?: number;
  user: { id: string; name: string };
  gateway: GatewayNameEnum;
  gatewayCustomerId: string;
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
