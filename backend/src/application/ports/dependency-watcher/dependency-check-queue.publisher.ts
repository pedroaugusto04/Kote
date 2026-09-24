export type DependencyCheckJobMessage = {
  jobId: string;
  userId: string;
  projectId: string;
  projectSlug: string;
  workspaceId: string;
  repositoryIds: string[];
  dependencyIds: string[];
  retryCount?: number;
};

export abstract class DependencyCheckQueuePublisher {
  abstract publish(message: DependencyCheckJobMessage): Promise<void>;
}
