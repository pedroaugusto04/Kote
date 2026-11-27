/**
 * Billing-related constants
 */

export const BILLING_ERROR_MESSAGES = {
  CPF_CNPJ_REQUIRED: 'CPF/CNPJ is required for PIX and Boleto payments',
  INVALID_CPF_CNPJ_FORMAT: 'Invalid CPF/CNPJ format. Enter 11 digits for CPF or 14 digits for CNPJ',
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
