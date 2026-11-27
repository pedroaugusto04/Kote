import type { WorkspaceScope } from '../../../application/models/workspace-scope.models.js';
import type { GithubBackfillJob } from '../../../application/use-cases/integrations/github-backfill.use-case.js';
import type {
  ConnectIntegrationBody,
  GithubBackfillBody,
  GithubRepositoriesBody,
  GuidedProviderParam,
  SessionParam,
} from '../dto/integration-credentials.dto.js';

export function toStartGithubBackfillInput(
  body: GithubBackfillBody,
  userId: string,
  scope: WorkspaceScope,
) {
  return {
    userId,
    workspaceSlug: scope.workspaceSlug,
    repositories: body.repositories,
  };
}

export function toGithubBackfillJobResponse(job: GithubBackfillJob) {
  return {
    id: job.id,
    status: job.status,
    total: job.total,
    processed: job.processed,
    imported: job.imported,
    skipped: job.skipped,
    limit: job.limit,
    repositories: job.repositories,
    error: job.error,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  };
}

export function toConnectIntegrationInput(
  params: GuidedProviderParam,
  body: ConnectIntegrationBody,
  userId: string,
  request?: { headers?: { origin?: string } },
  scope?: WorkspaceScope,
) {
  return {
    userId,
    workspaceSlug: scope?.workspaceSlug || body.workspaceSlug,
    provider: params.provider,
    returnToPath: body.returnToPath,
    browserOrigin: request?.headers?.origin,
  };
}

export function toGithubRepositoriesScopeInput(userId: string, scope: WorkspaceScope) {
  return {
    userId,
    workspaceSlug: scope.workspaceSlug,
  };
}

export function toSaveGithubRepositoriesInput(
  body: GithubRepositoriesBody,
  userId: string,
  scope: WorkspaceScope,
) {
  return {
    userId,
    workspaceSlug: scope.workspaceSlug,
    repositories: body.repositories,
  };
}

export function toIntegrationSessionInput(params: SessionParam, userId: string) {
  return {
    userId,
    provider: params.provider,
    sessionId: params.sessionId,
  };
}
