export type DependencyImportJobMessage = {
  jobId: string;
  userId: string;
  workspaceSlug: string;
  workspaceId: string;
  projectIds?: string[];
  repositoryIds?: string[];
  retryCount?: number;
};

export abstract class DependencyImportQueuePublisher {
  abstract publish(message: DependencyImportJobMessage): Promise<void>;
}
