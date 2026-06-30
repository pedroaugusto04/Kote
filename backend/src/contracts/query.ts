import { z } from 'zod';

import { paginationInputSchema } from './pagination.js';
import { notesListStatusFilterValues, StatusFilter } from './status-filters.js';

export const queryInputSchema = z
  .object({
    query: z.string().min(1),
    workspaceId: z.string().trim().optional(),
    projectId: z.string().trim().optional(),
    status: z.enum(notesListStatusFilterValues).default(StatusFilter.Open),
    limit: z.number().int().min(1).max(10).default(5),
  })
  .merge(paginationInputSchema)
  .transform((input) => ({
    ...input,
    status: input.status.trim().toLowerCase(),
    workspaceId: input.workspaceId?.trim() || undefined,
    projectId: input.projectId?.trim() || undefined,
  }));

export type QueryInput = z.infer<typeof queryInputSchema>;
