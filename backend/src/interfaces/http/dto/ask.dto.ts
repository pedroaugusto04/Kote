import { z } from 'zod';

import { askHistoryInputSchema, askInputSchema } from '../../../contracts/ask.js';

export const askRequestSchema = z
  .object({
    question: z.string().trim().min(1, 'Question cannot be empty'),
    projectSlug: z.string().trim().optional().default(''),
    workspaceSlug: z.string().trim().optional(),
  })
  .pipe(askInputSchema);

export const askHistoryQuerySchema = z.object({
  projectSlug: z.string().trim().optional().default(''),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
}).merge(paginationInputSchema);

export type AskRequest = z.infer<typeof askRequestSchema>;
export type AskHistoryQuery = z.infer<typeof askHistoryQuerySchema>;
