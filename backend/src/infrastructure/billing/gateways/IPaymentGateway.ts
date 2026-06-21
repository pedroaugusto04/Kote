import { BillingCycle, PaymentKind } from '../../persistence/schema/index.js';

export enum BillingTypeEnum {
  BOLETO = 'BOLETO',
  PIX = 'PIX',
  CREDIT_CARD = 'CREDIT_CARD',
}

export enum GatewayNameEnum {
  ASAAS = 'ASAAS',
  STRIPE = 'STRIPE',
}

export interface GatewayCustomer {
  id: string;
}

export interface CreateCustomerInput {
  name: string;
  email?: string;
  cpfCnpj?: string;
  phone?: string;
  mobilePhone?: string;
  externalReference?: string;
}

export interface GatewaySubscription {
  id: string;
  status?: string;
  nextDueDate?: Date | string;
}

export interface CreateSubscriptionInput {
  customerId: string;
  value: number;
  cycle: BillingCycle;
  nextDueDate: Date | string; // YYYY-MM-DD
  billingType: BillingTypeEnum;
  creditCardToken?: string;
  description?: string;
  externalReference?: string;
}

export interface UpdateSubscriptionInput {
  value?: number;
  cycle?: BillingCycle;
  nextDueDate?: Date | string; // YYYY-MM-DD
  billingType?: BillingTypeEnum;
  description?: string;
  externalReference?: string;
  /**
   * Asaas: when true, updates already generated pending payments to match the new subscription values.
   */
  updatePendingPayments?: boolean;
}

export interface GatewayPayment {
  id: string;
  status?: string;
  value: number;
  dueDate?: Date | string; // YYYY-MM-DD
  billingType?: BillingTypeEnum;
  creditCardToken?: string;
  paidAt?: Date | string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixQrCode?: string;
  pixQrCodeUrl?: string;
  subscription?: string;
  description?: string;
  externalReference?: string;
}

export interface CreatePaymentInput {
  customerId: string;
  billingType: BillingTypeEnum;
  creditCardToken?: string;
  value: number;
  dueDate: Date | string; // YYYY-MM-DD
  description?: string;
  externalReference?: string;
  subscriptionId?: string;
  userId: string;
  kind?: PaymentKind;
}

export interface UpdatePaymentInput {
  value?: number;
  dueDate?: string; // YYYY-MM-DD
  billingType?: BillingTypeEnum;
  description?: string;
  externalReference?: string;
}

export type GatewayWebhookEvent = {
  event: string;
  eventCreatedAt?: Date;
  payment?: GatewayPayment;
  subscription?: GatewaySubscription;
  raw: unknown;
};

export interface IPaymentGateway {
  readonly gateway: GatewayNameEnum;

  createCustomer(input: CreateCustomerInput): Promise<GatewayCustomer>;
  findCustomerByCpfCnpj(cpfCnpj: string): Promise<GatewayCustomer | null>;

  createSubscription(input: CreateSubscriptionInput): Promise<GatewaySubscription>;
  updateSubscription(gatewaySubscriptionId: string, input: UpdateSubscriptionInput): Promise<GatewaySubscription>;
  cancelSubscription(gatewaySubscriptionId: string): Promise<void>;

  cancelPayment(gatewayPaymentId: string): Promise<void>;
  createPayment(input: CreatePaymentInput): Promise<GatewayPayment>;

  updatePayment(gatewayPaymentId: string, input: UpdatePaymentInput): Promise<GatewayPayment>;
  getSubscriptionPayments(gatewaySubscriptionId: string): Promise<GatewayPayment[]>;

  getSubscriptionByGatewayId(gatewaySubscriptionId: string): Promise<GatewaySubscription | null>;

  parseWebhook(body: Record<string, unknown>): GatewayWebhookEvent;

  getPaymentByGatewayId(gatewayPaymentId: string): Promise<GatewayPayment | null>;
}
