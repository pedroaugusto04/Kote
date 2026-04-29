import { z } from 'zod';

import { slugify } from '../../../domain/strings.js';

export const createWorkspaceBodySchema = z
  .object({
    displayName: z.string().trim().min(1, 'Informe o nome do workspace.').max(120, 'Use no maximo 120 caracteres.'),
    workspaceSlug: z.string().trim().max(80, 'Use no maximo 80 caracteres.').optional(),
  })
  .strict()
  .transform((body, ctx) => {
    const workspaceSlug = slugify(body.workspaceSlug || body.displayName);
    if (!workspaceSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe um slug valido para o workspace.',
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
