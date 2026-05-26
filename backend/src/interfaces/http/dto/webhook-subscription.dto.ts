import { z } from 'zod';

import { WebhookTrigger } from '../../../contracts/enums.js';

export const webhookSubscriptionIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const createWebhookSubscriptionBodySchema = z
  .object({
    workspaceSlug: z.string().trim().min(1, 'Enter the workspace.'),
    label: z.string().trim().max(100, 'Use at most 100 characters.').optional().default(''),
    url: z.string().trim().url('Enter a valid URL.'),
    secret: z.string().trim().max(256, 'Use at most 256 characters.').optional(),
    events: z
      .array(z.nativeEnum(WebhookTrigger))
      .min(1, 'Select at least one event.')
      .transform((arr) => [...new Set(arr)]),
  })
  .strict();

export const updateWebhookSubscriptionBodySchema = z
  .object({
    label: z.string().trim().max(100, 'Use at most 100 characters.').optional(),
    url: z.string().trim().url('Enter a valid URL.').optional(),
    secret: z.string().trim().max(256, 'Use at most 256 characters.').optional(),
    events: z
      .array(z.nativeEnum(WebhookTrigger))
      .min(1, 'Select at least one event.')
      .transform((arr) => [...new Set(arr)])
      .optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const webhookSubscriptionQuerySchema = z.object({
  workspaceSlug: z.string().trim().min(1, 'Enter the workspace.'),
});

export type WebhookSubscriptionIdParam = z.infer<typeof webhookSubscriptionIdParamSchema>;
export type CreateWebhookSubscriptionBody = z.infer<typeof createWebhookSubscriptionBodySchema>;
export type UpdateWebhookSubscriptionBody = z.infer<typeof updateWebhookSubscriptionBodySchema>;
export type WebhookSubscriptionQuery = z.infer<typeof webhookSubscriptionQuerySchema>;
