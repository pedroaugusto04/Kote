/**
 * Billing-related constants
 */

export const BILLING_ERROR_MESSAGES = {
  CPF_CNPJ_REQUIRED: 'CPF/CNPJ is required for PIX and Boleto payments',
  INVALID_CPF_CNPJ_FORMAT: 'Invalid CPF/CNPJ format. Enter 11 digits for CPF or 14 digits for CNPJ',
} as const;

export const BILLING_CYCLE = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
} as const;

export const BILLING_TYPE = {
  CREDIT_CARD: 'credit_card',
  PIX: 'pix',
  BOLETO: 'boleto',
} as const;

export const COUNTRY_CODE = {
  BRAZIL: 'BR',
  UNITED_STATES: 'US',
} as const;

export type BillingCycle = typeof BILLING_CYCLE[keyof typeof BILLING_CYCLE];
export type BillingType = typeof BILLING_TYPE[keyof typeof BILLING_TYPE];
export type CountryCode = typeof COUNTRY_CODE[keyof typeof COUNTRY_CODE];
