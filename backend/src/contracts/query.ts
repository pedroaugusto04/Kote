import { z } from 'zod';

import { paginationInputSchema } from './pagination.js';
import { slugify } from '../domain/strings.js';
import { QueryMode } from './enums.js';

export const queryInputSchema = z
  .object({
    query: z.string().min(1),
    mode: z.nativeEnum(QueryMode).default(QueryMode.Answer),
    workspaceSlug: z.string().default(''),
    projectSlug: z.string().default(''),
    limit: z.number().int().min(1).max(10).default(5),
  })
  .merge(paginationInputSchema)
  .transform((input) => ({
    ...input,
    workspaceSlug: slugify(input.workspaceSlug),
    projectSlug: slugify(input.projectSlug),
  }));

export type QueryInput = z.infer<typeof queryInputSchema>;
