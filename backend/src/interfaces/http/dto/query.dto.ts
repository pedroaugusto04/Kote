import { z } from 'zod';

import { paginationInputSchema } from '../../../contracts/pagination.js';
import { queryInputSchema } from '../../../contracts/query.js';
import { ReminderDispatchMode } from '../../../contracts/enums.js';
import { StatusFilter } from '../../../contracts/status-filters.js';

export const queryRequestSchema = z.object({
  query: z.string().default(''),
  workspaceSlug: z.string().default(''),
  projectSlug: z.string().default(''),
  status: z.string().default(StatusFilter.Open),
  limit: z.coerce.number().default(5),
}).merge(paginationInputSchema).pipe(queryInputSchema);

export const markRemindersBodySchema = z
  .object({
    ids: z.array(z.string().trim().min(1)).min(1),
    mode: z.nativeEnum(ReminderDispatchMode).optional(),
    dispatchKey: z.string().trim().optional(),
  })
  .strict()
  .transform((body) => ({
    ids: body.ids.map((id) => id.trim()),
    mode: body.mode,
    dispatchKey: body.dispatchKey || undefined,
  }));

export type QueryRequest = z.infer<typeof queryRequestSchema>;
export type MarkRemindersBody = z.infer<typeof markRemindersBodySchema>;
