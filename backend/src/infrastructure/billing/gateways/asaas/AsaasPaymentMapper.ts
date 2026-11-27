import { BillingTypeEnum, type GatewayPayment, type GatewaySubscription } from '../IPaymentGateway.js';
import { toMoneyNumber, parseDateTimeInput, PLAN_PRICE_SCALE } from './AsaasHelpers.js';

export interface AsaasPaymentFallbackInput {
  id?: string;
  value?: number;
  dueDate?: Date | string;
  billingType?: BillingTypeEnum;
  subscriptionId?: string;
  description?: string;
  externalReference?: string;
}

export class AsaasPaymentMapper {
  static normalizeGatewayMoney(value: unknown, fallback = 0): number {
    if (value === null || value === undefined || value === '') return fallback;
    try {
      return toMoneyNumber(value, PLAN_PRICE_SCALE);
    } catch {
      return fallback;
    }
  }

  static normalizeOptionalDate(value: unknown): string | Date | undefined {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value !== 'string') return undefined;

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }

  static normalizeGatewayId(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return undefined;
  }

  static normalizeBillingType(value: unknown): BillingTypeEnum | undefined {
    const raw = typeof value === 'string' ? value.toUpperCase() : '';
    if (raw === BillingTypeEnum.BOLETO || raw === BillingTypeEnum.CREDIT_CARD || raw === BillingTypeEnum.PIX) {
      return raw as BillingTypeEnum;
    }
    return undefined;
  }

  static readCreditCardToken(data: any): string | undefined {
    return (
      data?.creditCardToken ||
      data?.creditCard?.creditCardToken ||
      data?.creditCard?.token ||
      undefined
    );
  }

  static asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  static toGatewayPayment(
    data: any,
    fallback?: AsaasPaymentFallbackInput,
  ): GatewayPayment {
    return {
      id: String(data?.id ?? fallback?.id ?? ''),
      status: data?.status ? String(data.status) : undefined,
      value: this.normalizeGatewayMoney(data?.value ?? fallback?.value ?? 0),
      dueDate: this.normalizeOptionalDate(data?.dueDate ?? fallback?.dueDate),
      billingType: this.normalizeBillingType(data?.billingType ?? fallback?.billingType),
      creditCardToken: this.readCreditCardToken(data),
      paidAt: this.normalizeOptionalDate(
        data?.paymentDate ?? data?.clientPaymentDate ?? data?.confirmedDate,
      ),
      invoiceUrl: this.asString(data?.invoiceUrl),
      bankSlipUrl: this.asString(data?.bankSlipUrl),
      pixQrCode: this.asString(data?.pixQrCode),
      pixQrCodeUrl: this.asString(data?.pixQrCodeUrl),
      subscription: data?.subscription
        ? String(data.subscription)
        : (fallback?.subscriptionId ? String(fallback.subscriptionId) : this.normalizeGatewayId(data?.subscription)),
      description: this.asString(data?.description ?? fallback?.description),
      externalReference: this.asString(data?.externalReference ?? fallback?.externalReference),
      customerId: this.normalizeGatewayId(data?.customer),
    };
  }

  static toGatewaySubscription(data: any): GatewaySubscription {
    return {
      id: String(data.id),
      status: data.status ? String(data.status) : undefined,
      nextDueDate: this.normalizeOptionalDate(data.nextDueDate),
    };
  }
}
