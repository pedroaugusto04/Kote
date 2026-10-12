import { BadRequestException } from '@nestjs/common';
import {
  BillingCycle,
  BillingType,
  SubscriptionStatus,
} from '../../../domain/enums/billing.enums.js';
import {
  PAYMENT_GATEWAY,
  COUNTRY_CODE,
  type PaymentGateway,
} from '../../../domain/constants/billing.constants.js';
import type { UserSubscriptionRecord } from '../../models/billing.models.js';

export interface ValidateSubscriptionPreconditionsInput {
  countryCode?: string;
  type: BillingType;
  cycle: BillingCycle;
  currentSub: UserSubscriptionRecord | null;
  planId: string;
}

export interface ValidatePaymentMethodRegistrationInput {
  countryCode?: string;
  type: BillingType;
  cycle: BillingCycle;
  isFreePlan: boolean;
  hasCreditCardOnFile: boolean;
  normalizedCreditCardToken?: string;
}

export interface ValidateSubscriptionRegistrationInput extends ValidateSubscriptionPreconditionsInput, ValidatePaymentMethodRegistrationInput {
  isChangeScheduled: boolean;
}

export function resolveBillingGateway(countryCode?: string): {
  isBrazil: boolean;
  isInternational: boolean;
  gatewayName: PaymentGateway;
} {
  const onlyStripe = process.env.ONLY_STRIPE === 'true';
  const isBrazil = countryCode?.toUpperCase() === COUNTRY_CODE.BRAZIL;
  const isInternational = onlyStripe || !isBrazil;
  const gatewayName: PaymentGateway = onlyStripe
    ? PAYMENT_GATEWAY.STRIPE
    : isBrazil
      ? PAYMENT_GATEWAY.ASAAS
      : PAYMENT_GATEWAY.STRIPE;

  return { isBrazil, isInternational, gatewayName };
}

export function validateSubscriptionPreconditions(input: ValidateSubscriptionPreconditionsInput): void {
  const { countryCode, type, cycle, currentSub, planId } = input;
  const { isBrazil, isInternational } = resolveBillingGateway(countryCode);
  const onlyStripe = process.env.ONLY_STRIPE === 'true';

  if (isInternational && (type === BillingType.PIX || type === BillingType.BOLETO)) {
    throw new BadRequestException('PIX and Boleto payments are only available for Brazilian users. Please select Credit Card.');
  }

  if (isBrazil && !onlyStripe) {
    if (!process.env.ASAAS_ACCESS_TOKEN) {
      throw new BadRequestException('ASAAS_ACCESS_TOKEN is not configured on the server.');
    }
  } else {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new BadRequestException('STRIPE_SECRET_KEY is not configured on the server.');
    }
  }

  if (currentSub?.status === SubscriptionStatus.PAST_DUE) {
    throw new BadRequestException('Your subscription has a past due payment. Please settle the pending payment to change plan or cycle.');
  }

  if (
    currentSub &&
    currentSub.planId === planId &&
    currentSub.billingCycle === cycle &&
    currentSub.status === SubscriptionStatus.ACTIVE
  ) {
    throw new BadRequestException('You are already subscribed to this plan with the same billing cycle.');
  }
}

export function validatePaymentMethodRegistration(input: ValidatePaymentMethodRegistrationInput): void {
  const {
    countryCode,
    type,
    cycle,
    isFreePlan,
    hasCreditCardOnFile,
    normalizedCreditCardToken,
  } = input;

  const { isInternational } = resolveBillingGateway(countryCode);
  const shouldCheckCardOnFile = type === BillingType.CREDIT_CARD || cycle === BillingCycle.MONTHLY;

  if (shouldCheckCardOnFile && cycle === BillingCycle.MONTHLY && type !== BillingType.CREDIT_CARD && hasCreditCardOnFile) {
    throw new BadRequestException('With a registered card, monthly subscriptions must use credit card.');
  }

  if (isInternational && type === BillingType.CREDIT_CARD && !isFreePlan && !hasCreditCardOnFile && !normalizedCreditCardToken) {
    throw new BadRequestException('Credit card details are required for international subscriptions.');
  }
}

export function validateSubscriptionRegistration(input: ValidateSubscriptionRegistrationInput): void {
  validateSubscriptionPreconditions(input);

  if (input.isChangeScheduled) {
    throw new BadRequestException('A plan change is already scheduled. Please wait or cancel the scheduled change before selecting a new plan.');
  }

  validatePaymentMethodRegistration(input);
}
