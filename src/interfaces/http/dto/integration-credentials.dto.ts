import { z } from 'zod';

import type { IntegrationProvider } from '../../../application/credentials.js';
import { AiProvider, ExternalIdentityProvider, IntegrationProvider as IntegrationProviderEnum } from '../../../contracts/enums.js';

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

const secretStringSchema = z.string().trim().min(1).max(1000);
const shortStringSchema = z.string().trim().min(1).max(200);
const idStringSchema = z.union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => value.length > 0 && value.length <= 200, { message: 'invalid_identifier' });
const urlSchema = z.string().trim().url().max(500);
const aiProviderSchema = z.enum([AiProvider.OpenAi, AiProvider.OpenRouter]);

const telegramConfigSchema = z.object({
  botToken: secretStringSchema,
  chatId: idStringSchema.optional(),
}).strict();

const whatsappConfigSchema = z.object({
  phoneNumber: shortStringSchema.optional(),
  groupJid: shortStringSchema.optional(),
  webhookToken: secretStringSchema.optional(),
}).strict().refine((config) => Boolean(config.phoneNumber || config.groupJid || config.webhookToken), {
  message: 'whatsapp_config_requires_identifier_or_token',
});

const evolutionConfigSchema = z.object({
  apiUrl: urlSchema,
  apiKey: secretStringSchema,
  instanceName: shortStringSchema,
}).strict();

const aiConfigSchema = z.object({
  provider: aiProviderSchema,
  apiKey: secretStringSchema,
  model: shortStringSchema,
  baseUrl: urlSchema.optional(),
}).strict();

const githubConfigSchema = z.object({
  token: secretStringSchema,
  username: shortStringSchema.optional(),
}).strict();

const githubAppConfigSchema = z.object({
  installationId: idStringSchema,
  accountLogin: shortStringSchema.optional(),
}).strict();

const providerConfigSchemas: Record<IntegrationProvider, z.ZodType<Record<string, string | number | boolean>>> = {
  [IntegrationProviderEnum.Telegram]: telegramConfigSchema,
  [IntegrationProviderEnum.Whatsapp]: whatsappConfigSchema,
  [IntegrationProviderEnum.Evolution]: evolutionConfigSchema,
  [IntegrationProviderEnum.AiReview]: aiConfigSchema,
  [IntegrationProviderEnum.AiConversation]: aiConfigSchema,
  [IntegrationProviderEnum.Github]: githubConfigSchema,
  [IntegrationProviderEnum.GithubApp]: githubAppConfigSchema,
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
