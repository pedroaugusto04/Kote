import { z } from 'zod';

import { conversationInputSchema } from '../../../contracts/conversation.js';
import { ExternalIdentityProvider, ReminderDispatchMode } from '../../../contracts/enums.js';
import { ingestPayloadSchema } from '../../../contracts/ingest.js';
import { onboardingInputSchema } from '../../../contracts/onboarding.js';
import { queryInputSchema } from '../../../contracts/query.js';
import { markRemindersBodySchema } from './query.dto.js';

const externalIdentityLookupSchema = z.object({
  provider: z.string().default(ExternalIdentityProvider.Whatsapp),
  identityType: z.string().default('jid'),
  externalId: z.string().default(''),
  workspaceSlug: z.string().optional(),
});

const tenantBodyBaseSchema = z.object({
  provider: z.string().optional(),
  identityType: z.string().optional(),
  externalId: z.string().optional(),
  workspaceSlug: z.string().optional(),
  externalIdentity: z
    .object({
      provider: z.string().optional(),
      identityType: z.string().optional(),
      identity_type: z.string().optional(),
      externalId: z.string().optional(),
      external_id: z.string().optional(),
      workspaceSlug: z.string().optional(),
    })
    .optional(),
  external_identity: z
    .object({
      provider: z.string().optional(),
      identityType: z.string().optional(),
      identity_type: z.string().optional(),
      externalId: z.string().optional(),
      external_id: z.string().optional(),
      workspaceSlug: z.string().optional(),
    })
    .optional(),
}).passthrough();

function internalPayloadBodySchema<T extends z.ZodTypeAny>(payloadSchema: T) {
  return z.preprocess((input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    const body = input as Record<string, unknown>;
    return body.payload === undefined ? { ...body, payload: body } : body;
  }, tenantBodyBaseSchema.extend({ payload: payloadSchema }));
}

export const internalN8nIngestBodySchema = internalPayloadBodySchema(ingestPayloadSchema);
export const internalN8nOnboardingBodySchema = internalPayloadBodySchema(onboardingInputSchema);
export const internalN8nQueryBodySchema = internalPayloadBodySchema(queryInputSchema);
export const internalN8nConversationBodySchema = internalPayloadBodySchema(conversationInputSchema);
export const internalN8nMarkSentBodySchema = internalPayloadBodySchema(markRemindersBodySchema);

export const internalReminderDispatchQuerySchema = z.object({
  provider: z.string().default(ExternalIdentityProvider.Whatsapp),
  identityType: z.string().default('jid'),
  externalId: z.string().default(''),
  mode: z.string().default(ReminderDispatchMode.Daily),
  workspaceSlug: z.string().default(''),
}).transform((query) => ({
  ...query,
  mode: query.mode === ReminderDispatchMode.Exact ? ReminderDispatchMode.Exact : ReminderDispatchMode.Daily,
}));

export type ExternalIdentityLookup = z.infer<typeof externalIdentityLookupSchema>;
export type InternalN8nIngestBody = z.infer<typeof internalN8nIngestBodySchema>;
export type InternalN8nOnboardingBody = z.infer<typeof internalN8nOnboardingBodySchema>;
export type InternalN8nQueryBody = z.infer<typeof internalN8nQueryBodySchema>;
export type InternalN8nConversationBody = z.infer<typeof internalN8nConversationBodySchema>;
export type InternalN8nMarkSentBody = z.infer<typeof internalN8nMarkSentBodySchema>;
export type InternalReminderDispatchQuery = z.infer<typeof internalReminderDispatchQuerySchema>;

export function resolveExternalIdentityLookup(body: z.infer<typeof tenantBodyBaseSchema>): ExternalIdentityLookup {
  const externalIdentity = body.externalIdentity || body.external_identity || {};
  return {
    provider: String(externalIdentity.provider || body.provider || ExternalIdentityProvider.Whatsapp),
    identityType: String(externalIdentity.identityType || externalIdentity.identity_type || body.identityType || 'jid'),
    externalId: String(externalIdentity.externalId || externalIdentity.external_id || body.externalId || ''),
    workspaceSlug: String(body.workspaceSlug || externalIdentity.workspaceSlug || ''),
  };
}
