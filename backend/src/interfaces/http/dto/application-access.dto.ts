import { z } from 'zod';

export const applicationAccessBodySchema = z.object({
  page: z.literal('landing'),
});

export type ApplicationAccessBody = z.infer<typeof applicationAccessBodySchema>;
