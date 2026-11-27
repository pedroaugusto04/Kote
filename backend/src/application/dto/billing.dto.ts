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
