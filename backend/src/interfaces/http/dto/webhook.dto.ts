import { z } from 'zod';

function looksLikeCanonicalIngestPayload(body: Record<string, unknown>): boolean {
  const source = body.source;
  const event = body.event;
  const content = body.content;
  const classification = body.classification;
  return Boolean(
    source && typeof source === 'object' &&
    event && typeof event === 'object' &&
    content && typeof content === 'object' &&
    classification && typeof classification === 'object',
  );
}

export const githubPushWebhookBodySchema = z
  .object({
    installation: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough()
      .optional(),
    repository: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        full_name: z.string().optional(),
      })
      .passthrough()
      .optional(),
    ref: z.string().optional(),
    before: z.string().optional(),
    after: z.string().optional(),
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
  .object({})
  .passthrough()
  .superRefine((body, ctx) => {
    if (!looksLikeCanonicalIngestPayload(body)) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Canonical ingest payload is not accepted on the WhatsApp webhook endpoint.',
    });
  });

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
