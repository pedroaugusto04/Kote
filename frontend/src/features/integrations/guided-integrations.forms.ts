import { z } from 'zod';

import type { UserIntegration } from '../../shared/api/models/integration';
import { INTEGRATION_MESSAGES } from './integrations.constants';

export type DisplayStatus = UserIntegration['status'];

export const githubRepositoriesFormSchema = z.object({
  repositories: z.array(z.string().trim().min(1, INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.VALIDATION_REQUIRED)).max(100, INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.VALIDATION_MAX),
});


export type GithubRepositoriesFormValues = z.infer<typeof githubRepositoriesFormSchema>;
