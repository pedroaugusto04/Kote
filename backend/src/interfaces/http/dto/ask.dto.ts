import { z } from 'zod';

import { askInputSchema } from '../../../contracts/ask.js';

export const askRequestSchema = z
  .object({
    question: z.string().trim().min(1, 'Question cannot be empty'),
  })
  .pipe(askInputSchema);

export type AskRequest = z.infer<typeof askRequestSchema>;
