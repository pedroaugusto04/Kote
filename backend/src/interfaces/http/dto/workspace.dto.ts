import { z } from 'zod';

import { slugify } from '../../../domain/strings.js';

export const createWorkspaceBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    workspaceSlug: z.string().trim().max(80).optional(),
  })
  .strict()
  .transform((body, ctx) => {
    const workspaceSlug = slugify(body.workspaceSlug || body.displayName);
    if (!workspaceSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'workspace_slug_required',
        path: ['workspaceSlug'],
      });
      return z.NEVER;
    }
    return {
      displayName: body.displayName,
      workspaceSlug,
    };
  });

export type CreateWorkspaceBody = z.infer<typeof createWorkspaceBodySchema>;
