import { z } from 'zod';

import { askInputSchema } from '../../../contracts/ask.js';
import { paginationInputSchema } from '../../../contracts/pagination.js';

export const askRequestSchema = askInputSchema;

export const askHistoryQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
}).merge(paginationInputSchema);

export type AskRequest = z.infer<typeof askRequestSchema>;
export type AskHistoryQuery = z.infer<typeof askHistoryQuerySchema>;

export const conversationIdParamSchema = z.object({
  id: z.string().uuid('Invalid conversation ID format'),
});

export type ConversationIdParam = z.infer<typeof conversationIdParamSchema>;
