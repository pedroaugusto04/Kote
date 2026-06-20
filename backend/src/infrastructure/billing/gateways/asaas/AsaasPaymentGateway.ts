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
      throw new Error('ASAAS_ACCESS_TOKEN não configurado');
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
    const token =
      payload?.creditCardToken ??
      payload?.creditCard?.creditCardToken ??
      payload?.creditCard?.token;

    if (typeof token !== 'string') return undefined;
    const normalized = token.trim();
    return normalized ? normalized : undefined;
  }

  private shouldDisableCustomerNotifications(): boolean {
    const raw = process.env.ASAAS_CUSTOMER_NOTIFICATIONS_DISABLED;
    if (!raw) return false;

    const normalized = raw.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  private normalizeGatewayMoney(value: unknown, fallback = 0): number {
    if (value === null || value === undefined || value === '') return fallback;

    try {
      return toMoneyNumber(value, PLAN_PRICE_SCALE);
    } catch {
      return fallback;
    }
  }

  private normalizeGatewayId(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return undefined;
  }

  private normalizeBillingType(value: unknown): BillingTypeEnum | undefined {
    if (value === BillingTypeEnum.BOLETO) return BillingTypeEnum.BOLETO;
    if (value === BillingTypeEnum.PIX) return BillingTypeEnum.PIX;
    if (value === BillingTypeEnum.CREDIT_CARD) return BillingTypeEnum.CREDIT_CARD;
    return undefined;
  }

  private normalizeOptionalDate(value: unknown): string | Date | undefined {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value !== 'string') return undefined;

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
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
      throw new Error('Asaas não retornou id do cliente');
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
      billingType: input.billingType,
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
      throw new Error('Asaas não retornou id da assinatura');
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
      ...(input.billingType ? { billingType: input.billingType } : {}),
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
      ...(input.billingType ? { billingType: input.billingType } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.externalReference ? { externalReference: input.externalReference } : {}),
    };

    const data = await this.request<any>(`/payments/${gatewayPaymentId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const payment: GatewayPayment = {
      id: String(data?.id ?? gatewayPaymentId),
      status: data?.status ? String(data.status) : undefined,
      value: this.normalizeGatewayMoney(data?.value ?? input.value),
      dueDate: this.normalizeOptionalDate(data?.dueDate ?? input.dueDate),
      billingType: this.normalizeBillingType(data?.billingType ?? input.billingType),
      creditCardToken: this.readCreditCardToken(data),
      paidAt: this.normalizeOptionalDate(
        data?.paymentDate ?? data?.clientPaymentDate ?? data?.confirmedDate
      ),
      invoiceUrl: typeof data?.invoiceUrl === 'string' ? data.invoiceUrl : undefined,
      bankSlipUrl: typeof data?.bankSlipUrl === 'string' ? data.bankSlipUrl : undefined,
      pixQrCode: typeof data?.pixQrCode === 'string' ? data.pixQrCode : undefined,
      pixQrCodeUrl: typeof data?.pixQrCodeUrl === 'string' ? data.pixQrCodeUrl : undefined,
      subscription: this.normalizeGatewayId(data?.subscription),
      description: typeof (data?.description ?? input.description) === 'string'
        ? (data?.description ?? input.description)
        : undefined,
      externalReference: typeof (data?.externalReference ?? input.externalReference) === 'string'
        ? (data?.externalReference ?? input.externalReference)
        : undefined,
    };

    if (payment?.id && !payment.pixQrCode && (input.billingType === BillingTypeEnum.PIX || data?.billingType === BillingTypeEnum.PIX)) {
      try {
        const pixRes = await this.request<any>(`/payments/${payment.id}/pixQrCode`, {
          method: 'GET',
        });
        const payloadStr = pixRes?.payload;
        if (isNonEmptyString(payloadStr)) {
          payment.pixQrCode = payloadStr;
          if (pixRes?.encodedImage) {
            payment.pixQrCodeUrl = `data:image/png;base64,${pixRes.encodedImage}`;
          }
        }
      } catch {
        // ignore
      }
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
      billingType: input.billingType,
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

    const payment: GatewayPayment = {
      id: String(data?.id ?? ''),
      status: data?.status ? String(data.status) : undefined,
      value: this.normalizeGatewayMoney(data?.value ?? input.value),
      dueDate: this.normalizeOptionalDate(data?.dueDate ?? input.dueDate),
      billingType: this.normalizeBillingType(data?.billingType ?? input.billingType),
      creditCardToken: this.readCreditCardToken(data),
      paidAt: this.normalizeOptionalDate(
        data?.paymentDate ?? data?.clientPaymentDate ?? data?.confirmedDate
      ),
      invoiceUrl: typeof data?.invoiceUrl === 'string' ? data.invoiceUrl : undefined,
      bankSlipUrl: typeof data?.bankSlipUrl === 'string' ? data.bankSlipUrl : undefined,
      pixQrCode: typeof data?.pixQrCode === 'string' ? data.pixQrCode : undefined,
      pixQrCodeUrl: typeof data?.pixQrCodeUrl === 'string' ? data.pixQrCodeUrl : undefined,
      subscription: data?.subscription ? String(data.subscription) : input.subscriptionId,
      description: typeof (data?.description ?? input.description) === 'string'
        ? (data?.description ?? input.description)
        : undefined,
      externalReference: typeof (data?.externalReference ?? input.externalReference) === 'string'
        ? (data?.externalReference ?? input.externalReference)
        : undefined,
    };

    if (payment?.id && !payment.pixQrCode) {
      try {
        const pixRes = await this.request<any>(`/payments/${payment.id}/pixQrCode`, {
          method: 'GET',
        });
        const payloadStr = pixRes?.payload;
        if (isNonEmptyString(payloadStr)) {
          payment.pixQrCode = payloadStr;
        }
      } catch {
        // ignore
      }
    }

    return payment;
  }

  async getSubscriptionPayments(gatewaySubscriptionId: string): Promise<GatewayPayment[]> {
    const data = await this.request<{ data?: AsaasPaymentLike[] }>(`/subscriptions/${gatewaySubscriptionId}/payments`, {
      method: 'GET',
    });
    const items = data?.data ?? [];

    const payments: GatewayPayment[] = items.flatMap((p) => {
      const id = this.normalizeGatewayId(p?.id);
      if (!id) return [];

      return [{
        id,
        status: typeof p?.status === 'string' ? p.status : undefined,
        value: this.normalizeGatewayMoney(p?.value ?? 0),
        dueDate: this.normalizeOptionalDate(p?.dueDate),
        billingType: this.normalizeBillingType(p?.billingType),
        creditCardToken: this.readCreditCardToken(p),
        paidAt: this.normalizeOptionalDate(p?.paymentDate ?? p?.clientPaymentDate ?? p?.confirmedDate),
        invoiceUrl: typeof p?.invoiceUrl === 'string' ? p.invoiceUrl : undefined,
        bankSlipUrl: typeof p?.bankSlipUrl === 'string' ? p.bankSlipUrl : undefined,
        pixQrCode: typeof p?.pixQrCode === 'string' ? p.pixQrCode : undefined,
        pixQrCodeUrl: typeof p?.pixQrCodeUrl === 'string' ? p.pixQrCodeUrl : undefined,
        subscription: this.normalizeGatewayId(p?.subscription),
        description: typeof p?.description === 'string' ? p.description : undefined,
        externalReference: typeof p?.externalReference === 'string' ? p.externalReference : undefined,
      }];
    });

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

    const payment = payload?.payment
      ? (() => {
          const paymentId = this.normalizeGatewayId(payload.payment?.id);
          if (!paymentId) return undefined;

          return {
            id: paymentId,
            status: payload.payment?.status ? String(payload.payment.status) : undefined,
            value: this.normalizeGatewayMoney(payload.payment?.value ?? 0),
            dueDate: this.normalizeOptionalDate(payload.payment?.dueDate),
            billingType: this.normalizeBillingType(payload.payment?.billingType),
            creditCardToken: this.readCreditCardToken(payload.payment),
            paidAt: this.normalizeOptionalDate(
              payload.payment?.paymentDate ??
              payload.payment?.clientPaymentDate ??
              payload.payment?.confirmedDate
            ),
            invoiceUrl: typeof payload.payment?.invoiceUrl === 'string' ? payload.payment.invoiceUrl : undefined,
            bankSlipUrl: typeof payload.payment?.bankSlipUrl === 'string' ? payload.payment.bankSlipUrl : undefined,
            pixQrCode: typeof payload.payment?.pixQrCode === 'string' ? payload.payment.pixQrCode : undefined,
            pixQrCodeUrl: typeof payload.payment?.pixQrCodeUrl === 'string' ? payload.payment.pixQrCodeUrl : undefined,
            subscription: this.normalizeGatewayId(payload.payment?.subscription),
            description: typeof payload.payment?.description === 'string' ? payload.payment.description : undefined,
            externalReference: typeof payload.payment?.externalReference === 'string'
              ? payload.payment.externalReference
              : undefined,
          } satisfies GatewayPayment;
        })()
      : undefined;

    const subscription = payload?.subscription
      ? ({
          id: String(payload.subscription.id),
          status: payload.subscription.status ? String(payload.subscription.status) : undefined,
          nextDueDate: payload.subscription.nextDueDate,
        } satisfies GatewaySubscription)
      : undefined;

    return { event, eventCreatedAt, payment, subscription, raw };
  }

  async getSubscriptionByGatewayId(gatewaySubscriptionId: string): Promise<GatewaySubscription | null> {
    const data = await this.request<any>(`/subscriptions/${gatewaySubscriptionId}`, {
      method: 'GET',
    });

    if (!data?.id) return null;

    return {
      id: String(data.id),
      status: data.status ? String(data.status) : undefined,
      nextDueDate: this.normalizeOptionalDate(data.nextDueDate),
    };
  }

  async getPaymentByGatewayId(gatewayPaymentId: string): Promise<GatewayPayment | null> {
    const data = await this.request<any>(`/payments/${gatewayPaymentId}`, {
      method: 'GET',
    });

    if (!data?.id) return null;

    const payment: GatewayPayment = {
      id: String(data.id),
      status: data.status ? String(data.status) : undefined,
      value: this.normalizeGatewayMoney(data.value ?? 0),
      dueDate: this.normalizeOptionalDate(data.dueDate),
      billingType: this.normalizeBillingType(data.billingType),
      creditCardToken: this.readCreditCardToken(data),
      paidAt: this.normalizeOptionalDate(
        data.paymentDate ??
        data.clientPaymentDate ??
        data.confirmedDate
      ),
      invoiceUrl: typeof data.invoiceUrl === 'string' ? data.invoiceUrl : undefined,
      bankSlipUrl: typeof data.bankSlipUrl === 'string' ? data.bankSlipUrl : undefined,
      pixQrCode: typeof data.pixQrCode === 'string' ? data.pixQrCode : undefined,
      pixQrCodeUrl: typeof data.pixQrCodeUrl === 'string' ? data.pixQrCodeUrl : undefined,
      subscription: data.subscription ? String(data.subscription) : undefined,
      description: typeof data.description === 'string' ? data.description : undefined,
      externalReference: typeof data.externalReference === 'string' ? data.externalReference : undefined,
    };

    if (payment?.id && !payment.pixQrCode) {
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

    return payment;
  }
}
