import { z } from 'zod';

import { askHistoryInputSchema, askInputSchema } from '../../../contracts/ask.js';
import { paginationInputSchema } from '../../../contracts/pagination.js';
import { askConversationTurnSchema } from '../../../contracts/ask-conversation.js';

export const askRequestSchema = z.object({
  question: z.string().trim().min(1, 'Question cannot be empty'),
  conversationId: z.string().uuid().optional(),
  conversationHistory: z.array(askConversationTurnSchema).optional(),
}).pipe(askInputSchema);

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
