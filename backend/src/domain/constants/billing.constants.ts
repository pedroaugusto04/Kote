/**
 * Billing-related constants
 */

export const BILLING_ERROR_MESSAGES = {
  CPF_CNPJ_REQUIRED: 'CPF/CNPJ is required for PIX and Boleto payments',
  INVALID_CPF_CNPJ_FORMAT: 'Invalid CPF/CNPJ format. Enter 11 digits for CPF or 14 digits for CNPJ',
  USER_NOT_FOUND: 'user_not_found',
  UNSUPPORTED_AVATAR_TYPE: 'unsupported_avatar_type',
  AVATAR_FILE_REQUIRED: 'avatar_file_required',
  AVATAR_FILE_TOO_LARGE: 'avatar_file_too_large',
} as const;

export const PAYMENT_GATEWAY = {
  ASAAS: 'asaas',
  STRIPE: 'stripe',
} as const;

export const COUNTRY_CODE = {
  BRAZIL: 'BR',
  UNITED_STATES: 'US',
} as const;

export type PaymentGateway = typeof PAYMENT_GATEWAY[keyof typeof PAYMENT_GATEWAY];
export type CountryCode = typeof COUNTRY_CODE[keyof typeof COUNTRY_CODE];
