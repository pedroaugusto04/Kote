import { z } from 'zod';

export const conversationMediaSchema = z.object({
  fileName: z.string().default(''),
  mimeType: z.string().default('application/octet-stream'),
  sizeBytes: z.number().int().nonnegative().default(0),
  dataBase64: z.string().default(''),
});

export const conversationInputSchema = z.object({
  messageText: z.string().default(''),
  senderId: z.string().min(1),
  groupId: z.string().min(1),
  messageId: z.string().default(''),
  hasMedia: z.boolean().default(false),
  media: conversationMediaSchema.default({}),
});

export type ConversationInput = z.infer<typeof conversationInputSchema>;
