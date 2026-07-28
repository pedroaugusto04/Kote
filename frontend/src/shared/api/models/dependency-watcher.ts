import type { GithubIntegrationRepository } from './integration';

export type DependencyMonitoredRepository = GithubIntegrationRepository & {
  monitored: boolean;
  projectNames: string[];
};

export type DependencyMonitoredRepositoriesResponse = {
  ok: true;
  workspaceSlug: string;
  repositories: DependencyMonitoredRepository[];
};

export type ProjectDependencyItem = {
  id: string;
  ecosystem: string;
  packageName: string;
  currentVersion: string;
  latestSeenVersion: string;
  lastCheckedAt: string | null;
  lastUrgency: 'optional' | 'recommended' | 'critical' | null;
  enabled: boolean;
};

export type ProjectDependencyGroup = {
  repositoryId: string;
  repositoryFullName: string;
  dependencies: ProjectDependencyItem[];
};

export type ProjectDependenciesResponse = {
  ok: true;
  projectSlug: string;
  workspaceSlug: string;
  groups: ProjectDependencyGroup[];
  total: number;
};
