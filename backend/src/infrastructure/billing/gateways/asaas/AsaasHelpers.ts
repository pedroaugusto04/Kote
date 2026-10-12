import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { toMoneyNumber as domainToMoneyNumber, PLAN_PRICE_SCALE } from '../../../../domain/utils/money.utils.js';

export const ASAAS_SANDBOX_BASE_URL = 'https://api-sandbox.asaas.com/v3';
export { PLAN_PRICE_SCALE };

export function toMoneyNumber(value: unknown, scale = PLAN_PRICE_SCALE): number {
  return domainToMoneyNumber(value, scale);
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


