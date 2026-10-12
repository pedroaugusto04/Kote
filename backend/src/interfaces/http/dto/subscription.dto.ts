import { z } from 'zod';
import { BillingCycle, BillingType } from '../../../domain/enums/billing.enums.js';

export const updateSubscriptionBodySchema = z.object({
  planId: z.string().min(1),
  billingCycle: z.nativeEnum(BillingCycle).optional(),
  billingType: z.nativeEnum(BillingType).optional(),
  cpfCnpj: z.string().optional(),
  countryCode: z.string().optional(),
  creditCardToken: z.string().optional(),
});

export type UpdateSubscriptionBody = z.infer<typeof updateSubscriptionBodySchema>;
