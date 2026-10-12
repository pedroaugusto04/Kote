import { z } from 'zod';

export const saveMonitoredRepositoriesBodySchema = z.object({
  repositoryIds: z.array(z.string()).default([]),
});

export type SaveMonitoredRepositoriesBody = z.infer<typeof saveMonitoredRepositoriesBodySchema>;

export const importDependenciesBodySchema = z.object({
  projectIds: z.array(z.string()).optional(),
  repositoryIds: z.array(z.string()).optional(),
});

export type ImportDependenciesBody = z.infer<typeof importDependenciesBodySchema>;

export const checkDependencyBodySchema = z.object({
  dependencyId: z.string().min(1),
});

export type CheckDependencyBody = z.infer<typeof checkDependencyBodySchema>;

export const toggleDependencyBodySchema = z.object({
  enabled: z.boolean(),
});

export type ToggleDependencyBody = z.infer<typeof toggleDependencyBodySchema>;
