import { z } from 'zod';

export const noteIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export type NoteIdParam = z.infer<typeof noteIdParamSchema>;
