import { z } from 'zod';

import { queryInputSchema } from '../../../contracts/query.js';

export const queryRequestSchema = z.object({
  query: z.string().default(''),
  mode: z.string().default('answer'),
  workspaceSlug: z.string().default(''),
  projectSlug: z.string().default(''),
  limit: z.coerce.number().default(5),
}).pipe(queryInputSchema);

export const markRemindersBodySchema = z
  .object({
    ids: z.array(z.string().trim().min(1)).min(1),
  })
  .strict()
  .transform((body) => ({ ids: body.ids.map((id) => id.trim()) }));

export type QueryRequest = z.infer<typeof queryRequestSchema>;
export type MarkRemindersBody = z.infer<typeof markRemindersBodySchema>;
