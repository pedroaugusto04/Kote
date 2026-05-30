import { z } from 'zod';

import { paginationInputSchema } from './pagination.js';

export const askInputSchema = z.object({
  question: z.string().trim().min(1, 'Question cannot be empty'),
  projectSlug: z.string().trim().default(''),
  workspaceSlug: z.string().trim().optional(),
});

export const askHistoryInputSchema = z.object({
  projectSlug: z.string().trim().optional().default(''),
}).merge(paginationInputSchema);

export type AskInput = z.infer<typeof askInputSchema>;
export type AskHistoryInput = z.infer<typeof askHistoryInputSchema>;
