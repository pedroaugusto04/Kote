import { Injectable, Logger } from '@nestjs/common';
import {
  CreateCustomerInput,
  CreatePaymentInput,
  CreateSubscriptionInput,
  GatewayNameEnum,
  GatewayCustomer,
  GatewayPayment,
  GatewaySubscription,
  GatewayWebhookEvent,
  IPaymentGateway,
  UpdateSubscriptionInput,
  UpdatePaymentInput,
  BillingTypeEnum,
} from '../IPaymentGateway.js';
import {
  toMoneyNumber,
  parseDateTimeInput,
  isNonEmptyString,
  getErrorMessage,
  asaasToAppError,
  ASAAS_SANDBOX_BASE_URL,
  PLAN_PRICE_SCALE,
} from './AsaasHelpers.js';
import { AsaasPaymentMapper } from './AsaasPaymentMapper.js';

interface AsaasCreditCardTokenSource {
  creditCardToken?: string;
  token?: string;
}

interface AsaasPaymentLike {
  id?: string | number;
  status?: string;
  value?: number | string | null;
  dueDate?: string;
  billingType?: string;
  paymentDate?: string;
  clientPaymentDate?: string;
  confirmedDate?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixQrCode?: string;
  pixQrCodeUrl?: string;
  subscription?: string | number;
  description?: string;
  externalReference?: string;
  creditCardToken?: string;
  creditCard?: AsaasCreditCardTokenSource | null;
}

interface AsaasSubscriptionLike {
  id?: string | number;
  status?: string;
  nextDueDate?: string;
}

interface AsaasWebhookBody {
  event?: string;
  dateCreated?: string | Date | null;
  payment?: AsaasPaymentLike;
  subscription?: AsaasSubscriptionLike;
}

function getAsaasBaseUrl() {
  const configuredBaseUrl = process.env.ASAAS_BASE_URL?.trim();
  if (configuredBaseUrl) return configuredBaseUrl;
  return ASAAS_SANDBOX_BASE_URL;
}

@Injectable()
export class AsaasPaymentGateway implements IPaymentGateway {
  readonly gateway = GatewayNameEnum.ASAAS;
  private readonly logger = new Logger(AsaasPaymentGateway.name);

  private ensureConfigured() {
    if (!process.env.ASAAS_ACCESS_TOKEN) {
      throw new Error('ASAAS_ACCESS_TOKEN not configured');
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    this.ensureConfigured();
    const url = `${getAsaasBaseUrl()}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'access_token': process.env.ASAAS_ACCESS_TOKEN || '',
      ...(options.headers || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const text = await response.text();
      let data: any = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (!response.ok) {
        throw {
          response: {
            status: response.status,
            data,
          },
        };
      }

      return data as T;
    } catch (err: any) {
      throw asaasToAppError(err);
    }
  }

  private readCreditCardToken(payload?: AsaasPaymentLike | null): string | undefined {
    return AsaasPaymentMapper.readCreditCardToken(payload);
  }

  private shouldDisableCustomerNotifications(): boolean {
    const raw = process.env.ASAAS_CUSTOMER_NOTIFICATIONS_DISABLED;
    if (!raw) return false;

    const normalized = raw.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  private normalizeGatewayMoney(value: unknown, fallback = 0): number {
    return AsaasPaymentMapper.normalizeGatewayMoney(value, fallback);
  }

  private normalizeGatewayId(value: unknown): string | undefined {
    return AsaasPaymentMapper.normalizeGatewayId(value);
  }

  private normalizeBillingType(value: unknown): BillingTypeEnum | undefined {
    return AsaasPaymentMapper.normalizeBillingType(value);
  }

  private normalizeOptionalDate(value: unknown): string | Date | undefined {
    return AsaasPaymentMapper.normalizeOptionalDate(value);
  }

  async createCustomer(input: CreateCustomerInput): Promise<GatewayCustomer> {
    const payload = {
      name: input.name,
      ...(input.email ? { email: input.email } : {}),
      ...(input.cpfCnpj ? { cpfCnpj: input.cpfCnpj } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.mobilePhone ? { mobilePhone: input.mobilePhone } : {}),
      ...(input.externalReference ? { externalReference: input.externalReference } : {}),
      notificationDisabled: this.shouldDisableCustomerNotifications(),
    };

    const data = await this.request<{ id: string }>('/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const id = this.normalizeGatewayId(data?.id);
    if (!id) {
      throw new Error('Asaas did not return customer id');
    }

    return { id };
  }

  async findCustomerByCpfCnpj(cpfCnpj: string): Promise<GatewayCustomer | null> {
    try {
      const data = await this.request<{ data?: Array<{ id: string }> }>(`/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}`, {
        method: 'GET',
      });

      const first = data?.data?.[0];
      if (!first?.id) return null;
      return { id: first.id };
    } catch (err) {
      this.logger.error(`Asaas: falha ao buscar customer por cpfCnpj: ${getErrorMessage(err)}`);
      return null;
    }
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<GatewaySubscription> {
    const payload = {
      customer: input.customerId,
      billingType: input.billingType.toUpperCase(),
      value: this.normalizeGatewayMoney(input.value),
      cycle: input.cycle,
      nextDueDate: input.nextDueDate,
      ...(input.billingType === BillingTypeEnum.CREDIT_CARD && input.creditCardToken
        ? { creditCardToken: input.creditCardToken }
        : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.externalReference ? { externalReference: input.externalReference } : {}),
    };

    const data = await this.request<any>('/subscriptions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const id = this.normalizeGatewayId(data?.id);
    if (!id) {
      throw new Error('Asaas did not return subscription id');
    }

    return {
      id,
      status: typeof data?.status === 'string' ? data.status : undefined,
      nextDueDate: this.normalizeOptionalDate(data?.nextDueDate),
    };
  }

  async updateSubscription(gatewaySubscriptionId: string, input: UpdateSubscriptionInput): Promise<GatewaySubscription> {
    const payload = {
      ...(input.value !== undefined ? { value: this.normalizeGatewayMoney(input.value) } : {}),
      ...(input.cycle ? { cycle: input.cycle } : {}),
      ...(input.nextDueDate ? { nextDueDate: input.nextDueDate } : {}),
      ...(input.billingType ? { billingType: input.billingType.toUpperCase() } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.externalReference ? { externalReference: input.externalReference } : {}),
      ...(input.updatePendingPayments !== undefined ? { updatePendingPayments: input.updatePendingPayments } : {}),
    };

    const data = await this.request<any>(`/subscriptions/${gatewaySubscriptionId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    return {
      id: this.normalizeGatewayId(data?.id) ?? gatewaySubscriptionId,
      status: typeof data?.status === 'string' ? data.status : undefined,
      nextDueDate: this.normalizeOptionalDate(data?.nextDueDate),
    };
  }

  async updatePayment(gatewayPaymentId: string, input: UpdatePaymentInput): Promise<GatewayPayment> {
    const payload = {
      ...(input.value !== undefined ? { value: this.normalizeGatewayMoney(input.value) } : {}),
      ...(input.dueDate ? { dueDate: input.dueDate } : {}),
      ...(input.billingType ? { billingType: input.billingType.toUpperCase() } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.externalReference ? { externalReference: input.externalReference } : {}),
    };

    const data = await this.request<any>(`/payments/${gatewayPaymentId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const payment = AsaasPaymentMapper.toGatewayPayment(data, {
      id: gatewayPaymentId,
      value: input.value,
      dueDate: input.dueDate,
      billingType: input.billingType,
      description: input.description,
      externalReference: input.externalReference,
    });

    if (input.billingType === BillingTypeEnum.PIX || data?.billingType === BillingTypeEnum.PIX) {
      await this.hydratePixQrCode(payment);
    }

    return payment;
  }

  async cancelSubscription(gatewaySubscriptionId: string): Promise<void> {
    await this.request<void>(`/subscriptions/${gatewaySubscriptionId}`, {
      method: 'DELETE',
    });
  }

  async cancelPayment(gatewayPaymentId: string): Promise<void> {
    await this.request<void>(`/payments/${gatewayPaymentId}`, {
      method: 'DELETE',
    });
  }

  async createPayment(input: CreatePaymentInput): Promise<GatewayPayment> {
    const payload = {
      customer: input.customerId,
      billingType: input.billingType.toUpperCase(),
      ...(input.billingType === BillingTypeEnum.CREDIT_CARD && input.creditCardToken
        ? { creditCardToken: input.creditCardToken }
        : {}),
      value: this.normalizeGatewayMoney(input.value),
      dueDate: input.dueDate,
      ...(input.description ? { description: input.description } : {}),
      ...(input.externalReference ? { externalReference: input.externalReference } : {}),
      ...(input.subscriptionId ? { subscription: input.subscriptionId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
    };

    const data = await this.request<any>('/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const payment = AsaasPaymentMapper.toGatewayPayment(data, {
      value: input.value,
      dueDate: input.dueDate,
      billingType: input.billingType,
      subscriptionId: input.subscriptionId,
      description: input.description,
      externalReference: input.externalReference,
    });

    await this.hydratePixQrCode(payment);

    return payment;
  }

  async getSubscriptionPayments(gatewaySubscriptionId: string): Promise<GatewayPayment[]> {
    const data = await this.request<{ data?: AsaasPaymentLike[] }>(`/subscriptions/${gatewaySubscriptionId}/payments`, {
      method: 'GET',
    });
    const items = data?.data ?? [];

    const payments: GatewayPayment[] = items
      .filter((p) => Boolean(AsaasPaymentMapper.normalizeGatewayId(p?.id)))
      .map((p) => AsaasPaymentMapper.toGatewayPayment(p));

    payments.sort((a, b) => String(b.dueDate ?? '').localeCompare(String(a.dueDate ?? '')));

    const latest = payments?.[0];
    if (latest?.id && !latest.pixQrCode) {
      try {
        const pixRes = await this.request<any>(`/payments/${latest.id}/pixQrCode`, {
          method: 'GET',
        });
        const payload = pixRes?.payload;
        if (isNonEmptyString(payload)) {
          latest.pixQrCode = payload;
          if (pixRes?.encodedImage) {
            latest.pixQrCodeUrl = `data:image/png;base64,${pixRes.encodedImage}`;
          }
        }
      } catch {
        // ignore
      }
    }

    return payments;
  }

  parseWebhook(body: Record<string, unknown>): GatewayWebhookEvent {
    const payload = body as AsaasWebhookBody;
    const event = String(payload?.event ?? '');
    const raw = payload;
    const eventCreatedAt = parseDateTimeInput(payload?.dateCreated) ?? undefined;

    const payment = payload?.payment && AsaasPaymentMapper.normalizeGatewayId(payload.payment?.id)
      ? AsaasPaymentMapper.toGatewayPayment(payload.payment)
      : undefined;

    const subscription = payload?.subscription && payload.subscription.id
      ? AsaasPaymentMapper.toGatewaySubscription(payload.subscription)
      : undefined;

    return { event, eventCreatedAt, payment, subscription, raw };
  }

  async getSubscriptionByGatewayId(gatewaySubscriptionId: string): Promise<GatewaySubscription | null> {
    const data = await this.request<any>(`/subscriptions/${gatewaySubscriptionId}`, {
      method: 'GET',
    });

    if (!data?.id) return null;

    return AsaasPaymentMapper.toGatewaySubscription(data);
  }

  async getPaymentByGatewayId(gatewayPaymentId: string): Promise<GatewayPayment | null> {
    const data = await this.request<any>(`/payments/${gatewayPaymentId}`, {
      method: 'GET',
    });

    if (!data?.id) return null;

    const payment = AsaasPaymentMapper.toGatewayPayment(data);
    await this.hydratePixQrCode(payment);

    return payment;
  }

  private async hydratePixQrCode(payment: GatewayPayment): Promise<void> {
    if (!payment?.id || payment.pixQrCode) return;
    try {
      const pixRes = await this.request<any>(`/payments/${payment.id}/pixQrCode`, {
        method: 'GET',
      });
      const payload = pixRes?.payload;
      if (isNonEmptyString(payload)) {
        payment.pixQrCode = payload;
        if (pixRes?.encodedImage) {
          payment.pixQrCodeUrl = `data:image/png;base64,${pixRes.encodedImage}`;
        }
      }
    } catch {
      // ignore
    }
  }
}
