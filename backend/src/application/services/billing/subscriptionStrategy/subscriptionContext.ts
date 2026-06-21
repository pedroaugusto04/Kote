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
