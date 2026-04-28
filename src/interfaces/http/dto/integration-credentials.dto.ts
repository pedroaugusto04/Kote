import { z } from 'zod';

import type { IntegrationProvider } from '../../../application/credentials.js';
import { ExternalIdentityProvider, IntegrationProvider as IntegrationProviderEnum } from '../../../contracts/enums.js';

const workspaceSlugSchema = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9._-]+$/).default('default');
const publicMetadataSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .default({});

const externalIdentitySchema = z.object({
  provider: z.nativeEnum(ExternalIdentityProvider),
  identityType: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9._-]+$/).optional(),
  externalId: z.string().trim().min(1).max(180),
});

const primitiveConfigValueSchema = z.union([z.string().min(1), z.number(), z.boolean()]);
const baseConfigSchema = z
  .record(primitiveConfigValueSchema)
  .refine((config) => Object.keys(config).length > 0, { message: 'config_must_not_be_empty' });

const providerConfigSchemas: Record<IntegrationProvider, z.ZodType<Record<string, string | number | boolean>>> = {
  [IntegrationProviderEnum.Telegram]: baseConfigSchema,
  [IntegrationProviderEnum.Whatsapp]: baseConfigSchema,
  [IntegrationProviderEnum.Evolution]: baseConfigSchema,
  [IntegrationProviderEnum.AiReview]: baseConfigSchema,
  [IntegrationProviderEnum.AiConversation]: baseConfigSchema,
  [IntegrationProviderEnum.Github]: baseConfigSchema,
  [IntegrationProviderEnum.GithubApp]: baseConfigSchema,
};

export const integrationProviderSchema = z.nativeEnum(IntegrationProviderEnum);

export const providerParamSchema = z.object({
  provider: integrationProviderSchema,
});

export const saveIntegrationCredentialBodySchema = z
  .object({
    workspaceSlug: workspaceSlugSchema.optional(),
    config: z.unknown(),
    publicMetadata: publicMetadataSchema.optional(),
    externalIdentities: z.array(externalIdentitySchema).max(5).default([]),
  })
  .strict();

export const resolveIntegrationCredentialBodySchema = z
  .object({
    workspaceSlug: workspaceSlugSchema.optional(),
    userId: z.string().uuid().optional(),
    externalIdentity: externalIdentitySchema.optional(),
  })
  .strict()
  .refine((body) => Boolean(body.userId || body.externalIdentity), { message: 'user_or_external_identity_required' })
  .transform((body) => ({
    ...body,
    workspaceSlug: body.workspaceSlug || 'default',
  }));

export const workspaceQuerySchema = z.object({
  workspaceSlug: workspaceSlugSchema.optional(),
}).transform((query) => ({
  workspaceSlug: query.workspaceSlug || 'default',
}));

export type SaveIntegrationCredentialBody = z.infer<typeof saveIntegrationCredentialBodySchema> & {
  provider: IntegrationProvider;
  config: Record<string, string | number | boolean>;
};

export type SaveIntegrationCredentialBodyInput = z.infer<typeof saveIntegrationCredentialBodySchema>;
export type ResolveIntegrationCredentialBody = z.infer<typeof resolveIntegrationCredentialBodySchema>;
export type ProviderParam = z.infer<typeof providerParamSchema>;
export type WorkspaceQuery = z.infer<typeof workspaceQuerySchema>;

export function parseSaveIntegrationCredentialBody(provider: IntegrationProvider, body: z.infer<typeof saveIntegrationCredentialBodySchema>): SaveIntegrationCredentialBody {
  const parsedConfig = providerConfigSchemas[provider].safeParse(body.config);
  if (!parsedConfig.success) throw new Error('invalid_integration_config');

  return {
    ...body,
    provider,
    workspaceSlug: body.workspaceSlug || 'default',
    publicMetadata: body.publicMetadata || {},
    config: parsedConfig.data,
  };
}
