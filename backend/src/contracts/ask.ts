import { z } from 'zod';

export const askInputSchema = z.object({
  question: z.string().trim().min(1, 'Question cannot be empty'),
});

export type AskInput = z.infer<typeof askInputSchema>;
