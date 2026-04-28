import { z } from 'zod';

export const githubPushWebhookBodySchema = z
  .object({
    installation: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .transform((body) => ({
    ...body,
    installation: body.installation
      ? {
          ...body.installation,
          id: body.installation.id == null ? undefined : String(body.installation.id),
        }
      : undefined,
  }));

export const whatsappWebhookBodySchema = z
  .object({
    schemaVersion: z.coerce.number().optional(),
  })
  .passthrough();

export type GithubPushWebhookBody = z.infer<typeof githubPushWebhookBodySchema>;
export type WhatsappWebhookBody = z.infer<typeof whatsappWebhookBodySchema>;
