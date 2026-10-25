import type { AuthenticatedUser } from '../../../application/services/auth/auth.service.js';
import type { UpdateSubscriptionInput } from '../../../application/use-cases/billing/update-subscription.use-case.js';
import type { UpdateSubscriptionBody } from '../dto/subscription.dto.js';
import { resolveUserCountryCode, type ResolveCountryOptions } from '../helpers/country-resolver.js';

export function toUpdateSubscriptionInput(
  body: UpdateSubscriptionBody,
  user: AuthenticatedUser,
  headers: Omit<ResolveCountryOptions, 'customCountryCode'>,
): UpdateSubscriptionInput {
  const countryCode = resolveUserCountryCode({
    customCountryCode: body.countryCode,
    ...headers,
  });

  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName || null,
    planId: body.planId,
    billingCycle: body.billingCycle,
    billingType: body.billingType,
    cpfCnpj: body.cpfCnpj,
    countryCode,
    creditCardToken: body.creditCardToken,
  };
}
