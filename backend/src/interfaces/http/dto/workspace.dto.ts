import { z } from 'zod';

import { slugify } from '../../../domain/strings.js';

export const createWorkspaceBodySchema = z
  .object({
    displayName: z.string().trim().min(1, 'Workspace name is required.').max(120, 'Maximum length is 120 characters.'),
    workspaceSlug: z.string().trim().max(80, 'Maximum length is 80 characters.').optional(),
  })
  .strict()
  .transform((body, ctx) => {
    const workspaceSlug = slugify(body.workspaceSlug || body.displayName);
    if (!workspaceSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Workspace slug is required.',
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
