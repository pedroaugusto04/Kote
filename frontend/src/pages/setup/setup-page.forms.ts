import { z } from 'zod';

export const workspaceFormSchema = z.object({
  displayName: z.string().trim().min(1, 'Workspace name is required.').max(120, 'Maximum length is 120 characters.'),
  workspaceSlug: z.string().trim().min(1, 'Workspace slug is required.').max(80, 'Maximum length is 80 characters.').regex(/^[a-z0-9._-]+$/, 'Use only lowercase letters, numbers, dots, hyphens, or underscores.'),
});

export type WorkspaceFormValues = z.infer<typeof workspaceFormSchema>;
