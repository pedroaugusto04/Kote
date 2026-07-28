import { DependencyEcosystem } from '../../../contracts/enums.js';

export type DependencyWatchRecord = {
  id: string;
  userId: string;
  workspaceId: string;
  workspaceSlug: string;
  ecosystem: DependencyEcosystem;
  packageName: string;
  currentVersion: string;
  latestSeenVersion: string;
  checkIntervalHours: number;
  lastCheckedAt: Date | null;
  lastAlertedAt: Date | null;
  enabled: boolean;
  repositoryId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateDependencyWatchInput = {
  userId: string;
  workspaceId: string;
  ecosystem: DependencyEcosystem;
  packageName: string;
  currentVersion: string;
  repositoryId?: string;
};

export type UpdateDependencyWatchInput = {
  latestSeenVersion?: string;
  lastCheckedAt?: Date;
  lastAlertedAt?: Date;
  enabled?: boolean;
};

export abstract class DependencyWatcherRepository {
  abstract upsert(input: CreateDependencyWatchInput): Promise<DependencyWatchRecord>;
  abstract batchUpsert(inputs: CreateDependencyWatchInput[]): Promise<void>;
  abstract findByUserAndWorkspace(userId: string, workspaceId: string): Promise<DependencyWatchRecord[]>;
  abstract findByRepositoryIds(userId: string, workspaceId: string, repositoryIds: string[]): Promise<DependencyWatchRecord[]>;
  abstract findDueForCheck(hours: number): Promise<DependencyWatchRecord[]>;
  abstract update(id: string, input: UpdateDependencyWatchInput): Promise<void>;
  abstract batchUpdateLastCheckedAt(ids: string[]): Promise<void>;
  abstract delete(id: string): Promise<void>;
  abstract deleteByWorkspace(userId: string, workspaceId: string): Promise<void>;
  abstract deleteByRepositoryIds(userId: string, workspaceId: string, repositoryIds: string[]): Promise<void>;
  abstract listMonitoredRepositoryIds(userId: string, workspaceId: string): Promise<string[]>;
  abstract setMonitoredRepositories(userId: string, workspaceId: string, repositoryIds: string[]): Promise<void>;
  abstract isWorkspaceEnabled(workspaceId: string): Promise<boolean>;
}
