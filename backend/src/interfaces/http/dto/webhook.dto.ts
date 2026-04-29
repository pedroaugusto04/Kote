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

export const telegramWebhookBodySchema = z
  .object({
    message: z
      .object({
        text: z.string().optional(),
        chat: z
          .object({
            id: z.union([z.string(), z.number()]).optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .transform((body) => ({
    ...body,
    message: body.message
      ? {
          ...body.message,
          chat: body.message.chat
            ? {
                ...body.message.chat,
                id: body.message.chat.id == null ? undefined : String(body.message.chat.id),
              }
            : undefined,
        }
      : undefined,
  }));

export type GithubPushWebhookBody = z.infer<typeof githubPushWebhookBodySchema>;
export type WhatsappWebhookBody = z.infer<typeof whatsappWebhookBodySchema>;
export type TelegramWebhookBody = z.infer<typeof telegramWebhookBodySchema>;
