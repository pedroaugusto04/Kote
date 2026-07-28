export type MonitoredRepositoryItem = {
  id: string;
  fullName: string;
  private: boolean;
  monitored: boolean;
  projectNames: string[];
};

export type ListDependencyMonitoredRepositoriesResult = {
  workspaceSlug: string;
  repositories: MonitoredRepositoryItem[];
};

export type SaveDependencyMonitoredRepositoriesResult = {
  monitored: number;
  import: {
    jobId: string;
    queued: number;
    repositories: number;
  };
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

export type ListProjectDependenciesResult = {
  projectSlug: string;
  workspaceSlug: string;
  groups: ProjectDependencyGroup[];
  total: number;
};
