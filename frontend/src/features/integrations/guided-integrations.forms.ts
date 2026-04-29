import { z } from 'zod';

import type { UserIntegration } from '../../shared/api/models/integration';

export type DisplayStatus = UserIntegration['status'];

export const githubRepositoriesFormSchema = z.object({
  repositories: z.array(z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'Use o formato owner/repositorio.')).max(100, 'Selecione no maximo 100 repositorios.'),
});

export type GithubRepositoriesFormValues = z.infer<typeof githubRepositoriesFormSchema>;
