import { Injectable } from '@nestjs/common';

import { ExternalIdentityProvider, IntegrationProvider, WebhookEventStatus } from '../../../../contracts/enums.js';
import { AppErrorCode, ExternalIdentityNotFoundException, GithubAuthException } from '../../../../domain/exceptions/index.js';
import type { GithubPullRequestWebhookRequest } from '../../../models/webhook-request.models.js';
import { ContentRepository } from '../../../ports/notes/content.repository.js';
import { GithubIntegrationGateway } from '../../../ports/integrations/github-integration.port.js';
import { ExternalIdentityRepository } from '../../../ports/integrations/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../../ports/observability/runtime-environment.port.js';
import { WebhookEventRepository } from '../../../ports/webhooks/webhook-events.repository.js';
import { normalizeHeaders } from '../../../utils/webhook/webhook.utils.js';
import { AiOperationType } from '../../../../domain/enums/plans.enums.js';
import { AiEntitlementService } from '../../../services/ai/ai-entitlement.service.js';
import { PrReviewAgentGateway } from '../../../ports/integrations/pr-review-agent.gateway.js';
import { PrReviewAgentToolsService } from '../../../services/review/pr-review-agent-tools.service.js';
import { AgentContextTracker } from '../../../services/query/agent-context-tracker.js';
import { resolveRagConfig } from '../../../utils/query/query-config.utils.js';
import { GithubRepositoryResolutionService } from '../../../services/integrations/github-repository-resolution.service.js';
import { AppLogger } from '../../../../observability/logger.js';
import { githubPrAuditPayload, type GithubPullRequestPayload } from '../../../utils/github/github-audit.utils.js';
import { filterAndTruncateChangedFiles } from '../../../utils/github/github-diff-filter.utils.js';
import { GithubPrCommentSyncService } from './github-pr-comment-sync.service.js';

@Injectable()
export class HandleGithubPullRequestUseCase {
  constructor(
    private readonly externalIdentities: ExternalIdentityRepository,
    private readonly webhookEvents: WebhookEventRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly githubIntegrationGateway: GithubIntegrationGateway,
    private readonly prReviewAgentGateway: PrReviewAgentGateway,
    private readonly prReviewAgentToolsService: PrReviewAgentToolsService,
    private readonly aiEntitlement: AiEntitlementService,
    private readonly prCommentSync: GithubPrCommentSyncService,
    private readonly githubRepositoryResolution: GithubRepositoryResolutionService,
    private readonly contentRepository: ContentRepository,
    private readonly logger: AppLogger,
  ) {}

  async execute(input: GithubPullRequestWebhookRequest, options?: { synchronous?: boolean }) {
    const environment = this.environmentProvider.read();
    const headers = normalizeHeaders(input.headers || {});
    const body = (input.body || {}) as GithubPullRequestPayload;
    const rawPayload = githubPrAuditPayload(body);
    const installationId = String((body.installation as { id?: unknown } | undefined)?.id || '').trim();
    const externalIdentity = { provider: ExternalIdentityProvider.GithubApp, identityType: 'installation_id', externalId: installationId };

    this.logger.info('github_pr_webhook_received', {
      action: body.action,
      prNumber: body.pull_request?.number,
      repository: body.repository?.full_name,
      sender: body.sender?.login,
    });

    if (!environment.githubWebhookSecret) {
      throw new GithubAuthException(AppErrorCode.GithubWebhookSecretNotConfigured);
    }

    try {
      this.githubIntegrationGateway.verifyWebhookSignature(
        environment.githubWebhookSecret,
        String(input.rawBody || ''),
        String(headers['x-hub-signature-256'] || ''),
      );
    } catch (error) {
      throw new GithubAuthException(AppErrorCode.InvalidGithubSignature);
    }

    if (!installationId) {
      throw new GithubAuthException(AppErrorCode.MissingInstallationId);
    }

    const identity = await this.externalIdentities.findExternalIdentity(ExternalIdentityProvider.GithubApp, 'installation_id', installationId);
    if (!identity) {
      this.logger.error('github_pr_installation_identity_not_found', {
        installationId,
        repository: body.repository?.full_name,
      });
      throw new ExternalIdentityNotFoundException();
    }

    this.logger.info('github_pr_installation_identity_found', {
      installationId,
      userId: identity.userId,
      workspaceSlug: identity.workspaceSlug,
      credentialId: identity.credentialId,
    });

    const prTitle = String(body.pull_request?.title || '');
    if (prTitle.toLowerCase().includes('[skip-kote]')) {
      this.logger.info('github_pr_skipped_by_title_keyword', {
        prNumber: body.pull_request?.number,
        repository: body.repository?.full_name,
        title: prTitle,
      });
      return this.recordIgnored({
        userId: identity.userId,
        externalIdentity,
        headers,
        rawPayload,
        reason: 'skipped_by_title_keyword',
      });
    }

    const action = String(body.action || '').trim().toLowerCase();
    if (action !== 'opened' && action !== 'synchronize') {
      this.logger.info('github_pr_ignored_action', {
        action,
        prNumber: body.pull_request?.number,
        repository: body.repository?.full_name,
      });
      return {
        ok: true,
        processed: false,
        ignored: 'unhandled_pull_request_action',
      };
    }

    await this.recordEvent({
      userId: identity.userId,
      externalIdentity,
      headers,
      rawPayload,
      status: WebhookEventStatus.Resolved,
    });

    const repoFullName = String(body.repository?.full_name || '').trim();
    const projectSlug = await this.githubRepositoryResolution.resolveProjectAndSyncRepoName({
      userId: identity.userId,
      workspaceSlug: identity.workspaceSlug || '',
      repositoryId: body.repository?.id || '0',
      repositoryFullName: repoFullName,
    });

    this.logger.info('github_pr_project_resolved', {
      repository: repoFullName,
      projectSlug,
      userId: identity.userId,
    });

    if (!projectSlug) {
      this.logger.warn('github_pr_no_project', {
        repository: repoFullName,
        userId: identity.userId,
      });
      return this.recordIgnored({
        userId: identity.userId,
        externalIdentity,
        headers,
        rawPayload,
        reason: 'github_repository_not_selected',
      });
    }

    if (options?.synchronous) {
      return this.processPullRequest(input, identity, headers, rawPayload, externalIdentity, projectSlug);
    }

    void this.processPullRequest(input, identity, headers, rawPayload, externalIdentity, projectSlug);

    return {
      ok: true,
      processed: false,
      status: 'queued',
    };
  }

  private async processPullRequest(
    input: GithubPullRequestWebhookRequest,
    identity: { userId: string; workspaceSlug?: string | null; credentialId?: string | null },
    headers: Record<string, string>,
    rawPayload: Record<string, unknown>,
    externalIdentity: { provider: ExternalIdentityProvider; identityType: string; externalId: string },
    projectSlug: string,
  ) {
    const environment = this.environmentProvider.read();
    const body = (input.body || {}) as GithubPullRequestPayload;
    const repoFullName = String(body.repository?.full_name || '').trim();
    const installationId = String((body.installation as { id?: unknown } | undefined)?.id || '').trim();

    try {
      const entitlement = await this.aiEntitlement.checkAndConsume({
        userId: identity.userId,
        workspaceSlug: identity.workspaceSlug || 'default',
        provider: IntegrationProvider.PrContextAi,
        operation: AiOperationType.GITHUB_PR_CONTEXT,
        metadata: { repoFullName, prNumber: body.pull_request?.number, source: 'github_pr_webhook' },
      });
      if (!entitlement.enabled) {
        this.logger.warn('github_pr_ai_disabled', {
          repository: repoFullName,
          projectSlug,
          userId: identity.userId,
        });
        return this.recordIgnored({
          userId: identity.userId,
          externalIdentity,
          headers,
          rawPayload,
          reason: 'pr_context_ai_disabled',
        });
      }

      if (!entitlement.quota.allowed) {
        this.logger.warn('github_pr_quota_exceeded', {
          repository: repoFullName,
          projectSlug,
          userId: identity.userId,
        });
        return this.recordIgnored({
          userId: identity.userId,
          externalIdentity,
          headers,
          rawPayload,
          reason: 'quota_exceeded',
        });
      }

      const token = await this.githubIntegrationGateway.fetchInstallationToken({
        appId: environment.githubAppId,
        privateKey: environment.githubAppPrivateKey,
        installationId,
      });

      if (!token) {
        this.logger.error('github_pr_token_fetch_failed', {
          installationId,
          repository: repoFullName,
        });
        throw new Error('failed_to_retrieve_github_token');
      }

      this.logger.info('github_pr_token_fetched', {
        installationId,
        repository: repoFullName,
        tokenLength: token.length,
      });

      // Verify the repository is accessible through this installation
      const installationRepositories = await this.githubIntegrationGateway.fetchInstallationRepositories({
        appId: environment.githubAppId,
        privateKey: environment.githubAppPrivateKey,
        installationId,
      });

      const repositoryAccessible = installationRepositories.some(
        (repo) => repo.fullName.toLowerCase() === repoFullName.toLowerCase()
      );

      this.logger.info('github_pr_repository_access_check', {
        installationId,
        repository: repoFullName,
        repositoryAccessible,
        installationRepositoriesCount: installationRepositories.length,
        installationRepositories: installationRepositories.map(r => r.fullName),
      });

      if (!repositoryAccessible) {
        this.logger.error('github_pr_repository_not_accessible', {
          installationId,
          repository: repoFullName,
          installationRepositories: installationRepositories.map(r => r.fullName),
        });
        throw new Error('repository_not_accessible_by_installation');
      }

      // Fetch comparison to get changed files and patches
      const baseSha = String(body.pull_request?.base?.sha || '');
      const headSha = String(body.pull_request?.head?.sha || '');

      // Check if we have already posted a comment for the current headSha
      const prNumber = Number(body.pull_request?.number || 0);
      const alreadyPosted = await this.prCommentSync.isCommentAlreadyPosted({
        repoFullName,
        prNumber,
        headSha,
        token,
      });
      if (alreadyPosted) {
        return this.recordIgnored({
          userId: identity.userId,
          externalIdentity,
          headers,
          rawPayload,
          reason: 'comment_already_exists_for_sha',
        });
      }

      const comparePayload = await this.githubIntegrationGateway.fetchComparePayload(repoFullName, baseSha, headSha, token);
      const changedFiles = filterAndTruncateChangedFiles(comparePayload.files);

      if (changedFiles.length === 0) {
        this.logger.info('github_pr_no_changed_files', {
          repository: repoFullName,
          projectSlug,
          prNumber: body.pull_request?.number,
        });
        await this.recordEvent({
          userId: identity.userId,
          externalIdentity,
          headers,
          rawPayload,
          status: WebhookEventStatus.Processed,
        });
        return {
          ok: true,
          processed: true,
          commentPosted: false,
          reason: 'no_changed_files',
        };
      }

      const prTitle = String(body.pull_request?.title || '');
      const prDescription = String(body.pull_request?.body || '');

      // Resolve workspace ID for scope
      const workspaces = await this.contentRepository.listWorkspaces(identity.userId);
      const matchedWorkspace = workspaces.find((w) => w.workspaceSlug === identity.workspaceSlug) || workspaces[0];
      const workspaceId = matchedWorkspace?.id || '';
      const scope = { workspaceId };

      const ragConfig = resolveRagConfig(environment);
      const tracker = new AgentContextTracker();

      const tools = this.prReviewAgentToolsService.buildTools({
        userId: identity.userId,
        scope,
        ragConfig,
        githubToken: token,
        repoFullName,
        headSha,
        tracker,
      });

      const prAiConfig = {
        provider: environment.prContextAiProvider,
        baseUrl: environment.prContextAiBaseUrl,
        model: environment.prContextAiModel,
        apiKey: environment.prContextAiApiKey,
        maxTurns: 5,
      };

      this.logger.info('github_pr_ai_agent_start', {
        repository: repoFullName,
        projectSlug,
        prNumber: body.pull_request?.number,
        changedFilesCount: changedFiles.length,
        aiProvider: environment.prContextAiProvider,
        aiModel: environment.prContextAiModel,
      });

      let decision;
      try {
        decision = await this.prReviewAgentGateway.run(
          prAiConfig,
          {
            repoFullName,
            prNumber,
            prTitle,
            prDescription,
            baseBranch: String(body.pull_request?.base?.ref || ''),
            headBranch: String(body.pull_request?.head?.ref || ''),
            headSha,
            changedFiles,
          },
          tools,
        );
        this.logger.info('github_pr_ai_agent_completed', {
          repository: repoFullName,
          projectSlug,
          prNumber: body.pull_request?.number,
          hasMeaningfulInsights: decision?.hasMeaningfulInsights,
          insightsCount: decision?.insights?.length || 0,
        });
      } catch (error) {
        this.logger.error('github_pr_ai_agent_failed', {
          repository: repoFullName,
          projectSlug,
          prNumber: body.pull_request?.number,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      if (!decision || !decision.hasMeaningfulInsights || decision.insights.length === 0) {
        this.logger.info('github_pr_no_meaningful_insights', {
          repository: repoFullName,
          projectSlug,
          prNumber: body.pull_request?.number,
        });
        await this.recordEvent({
          userId: identity.userId,
          externalIdentity,
          headers,
          rawPayload,
          status: WebhookEventStatus.Processed,
        });
        return {
          ok: true,
          processed: true,
          commentPosted: false,
          reason: 'no_meaningful_insights',
        };
      }

      // Format, post comment to the PR, and ingest review note
      const { commentPosted, noteId } = await this.prCommentSync.publishReviewCommentAndSyncNote({
        input,
        decision,
        trackedSources: tracker.getSources(),
        changedFiles,
        projectSlug,
        identity,
        repoFullName,
        prNumber,
        headSha,
        token,
      });

      await this.recordEvent({
        userId: identity.userId,
        externalIdentity,
        headers,
        rawPayload,
        status: WebhookEventStatus.Processed,
      });

      return {
        ok: true,
        processed: true,
        commentPosted,
        noteId,
      };
    } catch (error) {
      await this.recordEvent({
        userId: identity.userId,
        externalIdentity,
        headers,
        rawPayload,
        status: WebhookEventStatus.Failed,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }


  private async recordEvent(params: {
    userId: string;
    externalIdentity: { provider: ExternalIdentityProvider; identityType: string; externalId: string };
    headers: Record<string, string>;
    rawPayload: Record<string, unknown>;
    status: WebhookEventStatus;
    error?: string;
  }) {
    await this.webhookEvents.recordWebhookEvent({
      provider: IntegrationProvider.GithubApp,
      eventType: String(params.headers['x-github-event'] || 'pull_request'),
      status: params.status,
      resolvedUserId: params.userId,
      externalIdentity: params.externalIdentity,
      rawHeaders: params.headers,
      rawPayload: params.rawPayload,
      ...(params.error ? { error: params.error } : {}),
    });
  }

  private async recordIgnored(params: {
    userId: string;
    externalIdentity: { provider: ExternalIdentityProvider; identityType: string; externalId: string };
    headers: Record<string, string>;
    rawPayload: Record<string, unknown>;
    reason: string;
  }) {
    await this.recordEvent({ ...params, status: WebhookEventStatus.Ignored, error: params.reason });
    return {
      ok: true as const,
      processed: false as const,
      ignored: params.reason,
    };
  }
}

