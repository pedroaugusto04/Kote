import {
  AppErrorCode,
  AppException,
  GatewayCustomerNotFoundException,
  PaymentGatewayException,
} from '../../../../domain/exceptions/index.js';
import { toMoneyNumber, PLAN_PRICE_SCALE } from '../../../../domain/utils/money.utils.js';

export const ASAAS_SANDBOX_BASE_URL = 'https://api-sandbox.asaas.com/v3';
export { toMoneyNumber, PLAN_PRICE_SCALE };

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

export function asaasToAppError(err: any): AppException {
  if (err instanceof AppException) return err;

  const gatewayError = err || {};
  const code = gatewayError.code;
  const cause = err instanceof Error ? err : undefined;

  if (code === 'ECONNABORTED') {
    return new PaymentGatewayException(AppErrorCode.PaymentGatewayTimeout, {
      provider: 'asaas',
      cause,
    });
  }

  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT') {
    return new PaymentGatewayException(AppErrorCode.PaymentGatewayUnavailable, {
      provider: 'asaas',
      cause,
    });
  }

  const status = typeof gatewayError.response?.status === 'number'
    ? gatewayError.response.status
    : undefined;
  const data = gatewayError.response?.data;

  const message =
    data?.errors?.[0]?.description ||
    data?.message ||
    data?.error ||
    'Payment gateway failure. Please try again.';

  const responseBody = typeof data === 'string'
    ? data
    : data !== undefined && data !== null
      ? JSON.stringify(data)
      : undefined;

  if (status === 404 && typeof message === 'string' && /customer|cliente/i.test(message)) {
    return new GatewayCustomerNotFoundException(message);
  }

  return new PaymentGatewayException(AppErrorCode.AsaasPaymentFailed, {
    provider: 'asaas',
    status,
    responseBody,
    clientMessage: typeof message === 'string' ? message : undefined,
    cause,
  });
}


