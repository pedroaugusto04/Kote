import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

export const ASAAS_SANDBOX_BASE_URL = 'https://api-sandbox.asaas.com/v3';
export const PLAN_PRICE_SCALE = 2;

export function toMoneyNumber(value: unknown, scale = PLAN_PRICE_SCALE): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Invalid monetary value.');
    }
    return Number(value.toFixed(scale));
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(',', '.').trim();
    const num = parseFloat(cleaned);
    if (!Number.isNaN(num)) {
      return Number(num.toFixed(scale));
    }
  }
  throw new Error('Invalid monetary value.');
}

export function parseDateTimeInput(value?: string | Date | null): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function asaasToAppError(err: any): HttpException {
  if (err instanceof HttpException) return err;

  const gatewayError = err || {};
  const code = gatewayError.code;

  if (code === 'ECONNABORTED') {
    return new HttpException({ code: 'payment_gateway_timeout' }, HttpStatus.GATEWAY_TIMEOUT);
  }

  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT') {
    return new HttpException({ code: 'payment_gateway_unavailable' }, HttpStatus.BAD_GATEWAY);
  }

  const status = gatewayError.response?.status;
  const data = gatewayError.response?.data;

  const message =
    data?.errors?.[0]?.description ||
    data?.message ||
    data?.error ||
    'Payment gateway failure. Please try again.';

  return new HttpException({ code: 'asaas_payment_failed', details: { originalMessage: message } }, status || HttpStatus.BAD_REQUEST);
}

export function buildExternalReference(
  type: 'new' | 'upgrade' | 'change_cycle',
  billingIntentId: string
): string {
  if (!type) throw new Error('type is required for externalReference');
  if (!billingIntentId) throw new Error('billingIntentId is required for externalReference');

  return new URLSearchParams({
    t: type,
    id: billingIntentId,
  }).toString();
}

export function parseExternalReference(ref?: string | null): {
  type: 'new' | 'upgrade' | 'change_cycle';
  billingIntentId: string;
} {
  if (!ref) throw new BadRequestException('external_reference_missing');

  const params = new URLSearchParams(ref);

  const type = params.get('t') as 'new' | 'upgrade' | 'change_cycle' | null;
  const billingIntentId = params.get('id');

  if (!type) throw new BadRequestException('external_reference_invalid');
  if (!billingIntentId) throw new BadRequestException('external_reference_invalid');

  return { type, billingIntentId };
}

