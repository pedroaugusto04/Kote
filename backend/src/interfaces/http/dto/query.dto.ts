import { z } from 'zod';

import { paginationInputSchema } from '../../../contracts/pagination.js';
import { ReminderDispatchMode } from '../../../contracts/enums.js';
import { notesListStatusFilterValues, StatusFilter } from '../../../contracts/status-filters.js';
import { slugify } from '../../../domain/strings.js';

export const queryRequestSchema = z.object({
  query: z.string().default(''),
  workspaceSlug: z.string().default(''),
  projectSlug: z.string().default(''),
  status: z.string().default(StatusFilter.Open),
  limit: z.coerce.number().default(5),
}).merge(paginationInputSchema).transform((input) => ({
  ...input,
  query: input.query.trim(),
  workspaceSlug: slugify(input.workspaceSlug),
  projectSlug: slugify(input.projectSlug),
  status: notesListStatusFilterValues.includes(input.status.trim().toLowerCase() as typeof notesListStatusFilterValues[number])
    ? input.status.trim().toLowerCase()
    : StatusFilter.Open,
}));

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
