import type { GithubBackfillJobStatus } from '../../use-cases/integrations/github-backfill.use-case.js';

export type GithubBackfillJobRecord = {
  id: string;
  userId: string;
  workspaceSlug: string;
  repositories: string[];
  status: GithubBackfillJobStatus;
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  limit: number;
  error: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type CreateGithubBackfillJobInput = {
  id: string;
  userId: string;
  workspaceSlug: string;
  repositories: string[];
  total: number;
  limit: number;
};

export type UpdateGithubBackfillJobInput = {
  status?: GithubBackfillJobStatus;
  total?: number;
  processed?: number;
  imported?: number;
  skipped?: number;
  error?: string | null;
  completedAt?: string | null;
};

export abstract class GithubBackfillJobRepository {
  abstract create(input: CreateGithubBackfillJobInput): Promise<GithubBackfillJobRecord>;
  abstract findById(jobId: string, userId: string): Promise<GithubBackfillJobRecord | null>;
  /** Find by job ID only — for internal use by the queue consumer (no userId available). */
  abstract findByIdUnchecked(jobId: string): Promise<GithubBackfillJobRecord | null>;
  abstract update(jobId: string, patch: UpdateGithubBackfillJobInput): Promise<void>;
  /** Find any completed backfill for a workspace (for deduplication). */
  abstract findCompletedByWorkspace(userId: string, workspaceSlug: string): Promise<GithubBackfillJobRecord | null>;
}
