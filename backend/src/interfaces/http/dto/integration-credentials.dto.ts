import { z } from 'zod';

import { ExternalIdentityProvider, IntegrationProvider as IntegrationProviderEnum } from '../../../contracts/enums.js';

const requiredWorkspaceSlugSchema = z.string().trim().min(1, 'Workspace is required.').max(80, 'Maximum length is 80 characters.').regex(/^[a-zA-Z0-9._-]+$/, 'Only letters, numbers, dots, hyphens, and underscores are allowed.');
const repoFullNameSchema = z.string().trim().min(1, 'Repository is required.').max(200, 'Maximum length is 200 characters.').regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'Use the format owner/repository.');
export const githubRepositoryInputSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((value) => String(value).trim()),
  fullName: repoFullNameSchema,
});
const returnToPathSchema = z.string().trim().optional().transform((value, ctx) => {
  if (!value) return undefined;
  if (!value.startsWith('/') || value.startsWith('//')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use a relative return path.', path: ['returnToPath'] });
    return z.NEVER;
  }
  try {
    const parsed = new URL(value, 'https://knowledge-base.local');
    if (parsed.origin !== 'https://knowledge-base.local') throw new Error('invalid_origin');
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use a relative return path.', path: ['returnToPath'] });
    return z.NEVER;
  }
});

const externalIdentitySchema = z.object({
  provider: z.nativeEnum(ExternalIdentityProvider),
  identityType: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9._-]+$/).optional(),
  externalId: z.string().trim().min(1, 'External ID is required.')
    .max(180, 'Maximum length is 180 characters.'),
});

export const integrationProviderSchema = z.nativeEnum(IntegrationProviderEnum);
export const guidedIntegrationProviderSchema = z.enum([
  IntegrationProviderEnum.GithubApp,
  IntegrationProviderEnum.Whatsapp,
  IntegrationProviderEnum.Telegram,
  IntegrationProviderEnum.AiReview,
  IntegrationProviderEnum.AiConversation,
  IntegrationProviderEnum.ProjectBriefAi,
  IntegrationProviderEnum.PushNotifications,
]);
export const aiIntegrationProviderSchema = z.enum([IntegrationProviderEnum.AiReview, IntegrationProviderEnum.AiConversation, IntegrationProviderEnum.ProjectBriefAi]);

export const providerParamSchema = z.object({
  provider: integrationProviderSchema,
});

export const guidedProviderParamSchema = z.object({
  provider: guidedIntegrationProviderSchema,
});

export const aiProviderParamSchema = z.object({
  provider: aiIntegrationProviderSchema,
});

export const resolveIntegrationCredentialBodySchema = z
  .object({
    workspaceSlug: requiredWorkspaceSlugSchema.optional(),
    userId: z.string().uuid('Invalid user ID.').optional(),
    externalIdentity: externalIdentitySchema.optional(),
  })
  .strict()
  .refine((body) => Boolean(body.userId || body.externalIdentity), { message: 'user_or_external_identity_required' })
  .transform((body) => ({
    ...body,
    workspaceSlug: body.workspaceSlug || 'default',
  }));

export const workspaceQuerySchema = z.object({
  workspaceSlug: requiredWorkspaceSlugSchema,
});

export const connectIntegrationBodySchema = z
  .object({
    workspaceSlug: requiredWorkspaceSlugSchema,
    returnToPath: returnToPathSchema,
  })
  .strict();

export const githubAppCallbackQuerySchema = z.object({
  state: z.string().trim().min(1).max(300),
  installation_id: z.union([z.string(), z.number()]).transform((value) => String(value).trim()),
  setup_action: z.string().trim().min(1).max(120).optional(),
});

export const sessionParamSchema = z.object({
  provider: guidedIntegrationProviderSchema,
  sessionId: z.string().uuid('Invalid session ID.'),
});

export const githubRepositoriesBodySchema = z
  .object({
    workspaceSlug: requiredWorkspaceSlugSchema,
    repositories: z.array(githubRepositoryInputSchema).max(100),
  })
  .strict()
  .transform((body) => {
    const seen = new Set();
    return {
      workspaceSlug: body.workspaceSlug,
      repositories: body.repositories.filter((item) => {
        const id = String(item.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      }),
    };
  });

export type ResolveIntegrationCredentialBody = z.infer<typeof resolveIntegrationCredentialBodySchema>;
export type ProviderParam = z.infer<typeof providerParamSchema>;
export type GuidedProviderParam = z.infer<typeof guidedProviderParamSchema>;
export type AiProviderParam = z.infer<typeof aiProviderParamSchema>;
export type WorkspaceQuery = z.infer<typeof workspaceQuerySchema>;
export type ConnectIntegrationBody = z.infer<typeof connectIntegrationBodySchema>;
export type GithubAppCallbackQuery = z.infer<typeof githubAppCallbackQuerySchema>;
export type SessionParam = z.infer<typeof sessionParamSchema>;
export type GithubRepositoriesBody = z.infer<typeof githubRepositoriesBodySchema>;
