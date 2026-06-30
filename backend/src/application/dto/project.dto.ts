import { z } from 'zod';

export const createProjectSchema = z
  .object({
    displayName: z.string().min(1, 'displayName is required').max(120, 'displayName must be at most 120 characters'),
    projectSlug: z.string().min(1, 'projectSlug is required').max(80, 'projectSlug must be at most 80 characters'),
    repositoryIds: z.array(z.string()).default([]),
    defaultTags: z.array(z.string()).default([]),
  })
  .strict();

export type CreateProjectDto = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    projectId: z.string().min(1, 'projectId is required'),
    displayName: z.string().min(1, 'displayName is required').max(120, 'displayName must be at most 120 characters'),
    repositoryIds: z.array(z.string()).default([]),
    defaultTags: z.array(z.string()).default([]),
  })
  .strict();

export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;
