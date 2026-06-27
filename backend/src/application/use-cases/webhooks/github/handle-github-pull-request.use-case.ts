import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { CredentialRecordStatus, ExternalIdentityProvider, IntegrationProvider, WebhookEventStatus } from '../../../../contracts/enums.js';
import type { GithubPullRequestWebhookRequest } from '../../../models/webhook-request.models.js';
import { ContentRepository } from '../../../ports/notes/content.repository.js';
import { GithubIntegrationGateway } from '../../../ports/integrations/github-integration.port.js';
import { CredentialRepository, ExternalIdentityRepository } from '../../../ports/integrations/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../../ports/observability/runtime-environment.port.js';
import { WebhookEventRepository } from '../../../ports/webhooks/webhook-events.repository.js';
import { normalizeHeaders } from '../../../utils/webhook.utils.js';
import { QuotaService } from '../../../services/quota.service.js';
import { AiOperationType } from '../../../../domain/enums/plans.enums.js';
import { EmbeddingGateway } from '../../../ports/notes/embedding.gateway.js';
import { NoteEmbeddingRepository } from '../../../ports/notes/note-embedding.repository.js';
import { AnswerGenerationGateway } from '../../../ports/query/answer-generation.gateway.js';
import { AppLogger } from '../../../../observability/logger.js';

type GithubPullRequestPayload = {
  action?: string;
  number?: number;
  pull_request?: {
    number?: number;
    title?: string;
    body?: string;
    base?: { sha?: string };
    head?: { sha?: string };
  };
  installation?: { id?: string | number };
  repository?: {
    id?: string | number;
    full_name?: string;
    private?: boolean;
  };
  sender?: { login?: string };
};

function githubPrAuditPayload(body: GithubPullRequestPayload): Record<string, unknown> {
  return {
    action: String(body.action || ''),
    prNumber: body.pull_request?.number == null ? 0 : Number(body.pull_request.number),
    installationId: body.installation?.id == null ? '' : String(body.installation.id),
    repositoryId: body.repository?.id == null ? '' : String(body.repository.id),
    repositoryFullName: String(body.repository?.full_name || '').trim(),
    repositoryPrivate: body.repository?.private === true,
    baseSha: String(body.pull_request?.base?.sha || ''),
    headSha: String(body.pull_request?.head?.sha || ''),
    senderLogin: String(body.sender?.login || ''),
  };
}

@Injectable()
export class HandleGithubPullRequestUseCase {
  private readonly logger: AppLogger;

  constructor(
    private readonly externalIdentities: ExternalIdentityRepository,
    private readonly webhookEvents: WebhookEventRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly githubIntegrationGateway: GithubIntegrationGateway,
    private readonly embeddingGateway: EmbeddingGateway,
    private readonly noteEmbeddingRepository: NoteEmbeddingRepository,
    private readonly answerGenerationGateway: AnswerGenerationGateway,
    private readonly quotaService?: QuotaService,
    private readonly contentRepository?: ContentRepository,
    private readonly credentials?: CredentialRepository,
  ) {
    this.logger = AppLogger.create();
  }

  async execute(input: GithubPullRequestWebhookRequest) {
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
      throw new UnauthorizedException('github_webhook_secret_not_configured');
    }

    try {
      this.githubIntegrationGateway.verifyWebhookSignature(
        environment.githubWebhookSecret,
        String(input.rawBody || ''),
        String(headers['x-hub-signature-256'] || ''),
      );
    } catch (error) {
      throw new UnauthorizedException('invalid_github_signature');
    }

    if (!installationId) {
      throw new UnauthorizedException('missing_installation_id');
    }

    const identity = await this.externalIdentities.findExternalIdentity(ExternalIdentityProvider.GithubApp, 'installation_id', installationId);
    if (!identity) {
      throw new NotFoundException('identity_not_found');
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

    await this.webhookEvents.recordWebhookEvent({
      provider: IntegrationProvider.GithubApp,
      eventType: String(headers['x-github-event'] || 'pull_request'),
      status: WebhookEventStatus.Resolved,
      resolvedUserId: identity.userId,
      externalIdentity,
      rawHeaders: headers,
      rawPayload,
    });

    try {
      const repoFullName = String(body.repository?.full_name || '').trim();
      const projectSlug = await this.findSelectedProjectSlug(repoFullName, identity.userId, identity.workspaceSlug || '');

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
        await this.webhookEvents.recordWebhookEvent({
          provider: IntegrationProvider.GithubApp,
          eventType: String(headers['x-github-event'] || 'pull_request'),
          status: WebhookEventStatus.Ignored,
          resolvedUserId: identity.userId,
          externalIdentity,
          rawHeaders: headers,
          rawPayload,
          error: 'github_repository_not_selected',
        });
        return {
          ok: true,
          processed: false,
          ignored: 'github_repository_not_selected',
        };
      }

      // Check if PR Context AI is enabled (active by default if no credential record exists)
      const aiCredential = this.credentials
        ? await this.credentials.findCredential(identity.userId, identity.workspaceSlug || '', IntegrationProvider.PrContextAi)
        : null;
      const aiEnabled = !aiCredential || (aiCredential.status === CredentialRecordStatus.Connected && !aiCredential.revokedAt);

      this.logger.info('github_pr_ai_check', {
        repository: repoFullName,
        projectSlug,
        aiEnabled,
        userId: identity.userId,
      });

      if (!aiEnabled) {
        this.logger.warn('github_pr_ai_disabled', {
          repository: repoFullName,
          projectSlug,
          userId: identity.userId,
        });
        await this.webhookEvents.recordWebhookEvent({
          provider: IntegrationProvider.GithubApp,
          eventType: String(headers['x-github-event'] || 'pull_request'),
          status: WebhookEventStatus.Ignored,
          resolvedUserId: identity.userId,
          externalIdentity,
          rawHeaders: headers,
          rawPayload,
          error: 'pr_context_ai_disabled',
        });
        return {
          ok: true,
          processed: false,
          ignored: 'pr_context_ai_disabled',
        };
      }

      // Check AI credit quota
      const quotaOk = this.quotaService
        ? await this.quotaService.checkAndIncrementAiUsage(
            identity.userId,
            AiOperationType.GITHUB_PR_CONTEXT,
            { repoFullName, prNumber: body.pull_request?.number, source: 'github_pr_webhook' },
          ).then((r) => r.allowed)
        : true;

      this.logger.info('github_pr_quota_check', {
        repository: repoFullName,
        projectSlug,
        quotaOk,
        userId: identity.userId,
      });

      if (!quotaOk) {
        this.logger.warn('github_pr_quota_exceeded', {
          repository: repoFullName,
          projectSlug,
          userId: identity.userId,
        });
        await this.webhookEvents.recordWebhookEvent({
          provider: IntegrationProvider.GithubApp,
          eventType: String(headers['x-github-event'] || 'pull_request'),
          status: WebhookEventStatus.Ignored,
          resolvedUserId: identity.userId,
          externalIdentity,
          rawHeaders: headers,
          rawPayload,
          error: 'quota_exceeded',
        });
        return {
          ok: true,
          processed: false,
          ignored: 'quota_exceeded',
        };
      }

      const token = await this.githubIntegrationGateway.fetchInstallationToken({
        appId: environment.githubAppId,
        privateKey: environment.githubAppPrivateKey,
        installationId,
      });

      if (!token) {
        throw new Error('failed_to_retrieve_github_token');
      }

      // Fetch comparison to get changed files and patches
      const baseSha = String(body.pull_request?.base?.sha || '');
      const headSha = String(body.pull_request?.head?.sha || '');
      const comparePayload = await this.githubIntegrationGateway.fetchComparePayload(repoFullName, baseSha, headSha, token);
      const changedFiles = comparePayload.files.map(f => ({
        filename: f.filename,
        status: f.status,
        patch: f.patch,
      }));

      // Perform semantic search
      const prTitle = String(body.pull_request?.title || '');
      const prDescription = String(body.pull_request?.body || '');
      const searchTerms = [prTitle, prDescription].filter(Boolean).join('\n').trim();

      this.logger.info('github_pr_semantic_search_start', {
        repository: repoFullName,
        projectSlug,
        prNumber: body.pull_request?.number,
        hasSearchTerms: Boolean(searchTerms),
      });

      let contextChunks: any[] = [];
      if (searchTerms) {
        const embeddingConfig = {
          provider: environment.embeddingAiProvider,
          baseUrl: environment.embeddingAiBaseUrl,
          model: environment.embeddingAiModel,
          apiKey: environment.embeddingAiApiKey,
        };
        const embeddings = await this.embeddingGateway.generateEmbeddings(embeddingConfig, [searchTerms]);
        const prEmbedding = embeddings[0];

        if (prEmbedding && prEmbedding.length > 0) {
          const similarChunks = await this.noteEmbeddingRepository.findSimilar(identity.userId, prEmbedding, {
            limit: 8,
            workspaceSlug: identity.workspaceSlug,
            minSimilarity: 0.65,
          });

          this.logger.info('github_pr_semantic_search_results', {
            repository: repoFullName,
            projectSlug,
            prNumber: body.pull_request?.number,
            similarChunksCount: similarChunks.length,
          });

          if (similarChunks.length > 0 && this.contentRepository) {
            const noteIds = Array.from(new Set(similarChunks.map((c) => c.noteId)));
            const notes = await this.contentRepository.getNotesByIds(identity.userId, noteIds);
            const noteMap = new Map(notes.map((n) => [n.id, n]));
            contextChunks = similarChunks
              .map((chunk) => {
                const note = noteMap.get(chunk.noteId);
                if (!note) return null;
                return {
                  noteId: chunk.noteId,
                  title: note.title,
                  path: note.path,
                  projectSlug: note.projectSlug,
                  workspaceId: note.workspaceId,
                  chunkText: chunk.chunkText,
                };
              })
              .filter((c) => c !== null);
          }
        }
      }

      if (contextChunks.length === 0) {
        this.logger.info('github_pr_no_context', {
          repository: repoFullName,
          projectSlug,
          prNumber: body.pull_request?.number,
        });
        await this.webhookEvents.recordWebhookEvent({
          provider: IntegrationProvider.GithubApp,
          eventType: String(headers['x-github-event'] || 'pull_request'),
          status: WebhookEventStatus.Processed,
          resolvedUserId: identity.userId,
          externalIdentity,
          rawHeaders: headers,
          rawPayload,
        });
        return {
          ok: true,
          processed: true,
          commentPosted: false,
          reason: 'no_matching_notes',
        };
      }

      // Generate the comment
      const prAiConfig = {
        provider: environment.prContextAiProvider,
        baseUrl: environment.prContextAiBaseUrl,
        model: environment.prContextAiModel,
        apiKey: environment.prContextAiApiKey,
      };

      this.logger.info('github_pr_ai_comment_generation_start', {
        repository: repoFullName,
        projectSlug,
        prNumber: body.pull_request?.number,
        contextChunksCount: contextChunks.length,
        changedFilesCount: changedFiles.length,
        aiProvider: environment.prContextAiProvider,
        aiModel: environment.prContextAiModel,
      });

      let commentText;
      try {
        commentText = await this.answerGenerationGateway.generatePullRequestComment(prAiConfig, {
          prTitle,
          prDescription,
          changedFiles,
          context: contextChunks,
        });
        this.logger.info('github_pr_ai_comment_generated', {
          repository: repoFullName,
          projectSlug,
          prNumber: body.pull_request?.number,
          commentLength: commentText?.length || 0,
        });
      } catch (error) {
        this.logger.error('github_pr_ai_comment_generation_failed', {
          repository: repoFullName,
          projectSlug,
          prNumber: body.pull_request?.number,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      this.logger.info('github_pr_ai_comment_raw_response', {
        repository: repoFullName,
        projectSlug,
        prNumber: body.pull_request?.number,
        commentText,
        commentLength: commentText?.length || 0,
        commentTrimmed: commentText?.trim(),
        commentTrimmedUpper: commentText?.trim().toUpperCase(),
      });

      if (!commentText || commentText.trim() === 'NONE' || commentText.trim().toUpperCase() === 'NONE') {
        this.logger.info('github_pr_no_relevant_context', {
          repository: repoFullName,
          projectSlug,
          prNumber: body.pull_request?.number,
        });
        await this.webhookEvents.recordWebhookEvent({
          provider: IntegrationProvider.GithubApp,
          eventType: String(headers['x-github-event'] || 'pull_request'),
          status: WebhookEventStatus.Processed,
          resolvedUserId: identity.userId,
          externalIdentity,
          rawHeaders: headers,
          rawPayload,
        });
        return {
          ok: true,
          processed: true,
          commentPosted: false,
          reason: 'no_relevant_ai_context',
        };
      }

      // Post the comment to the PR
      const prNumber = Number(body.pull_request?.number || 0);

      this.logger.info('github_pr_posting_comment', {
        repository: repoFullName,
        projectSlug,
        prNumber,
        commentLength: commentText.length,
      });

      const posted = await this.githubIntegrationGateway.postPullRequestComment(repoFullName, prNumber, commentText, token);

      this.logger.info('github_pr_comment_posted', {
        repository: repoFullName,
        projectSlug,
        prNumber,
        posted,
      });

      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.GithubApp,
        eventType: String(headers['x-github-event'] || 'pull_request'),
        status: WebhookEventStatus.Processed,
        resolvedUserId: identity.userId,
        externalIdentity,
        rawHeaders: headers,
        rawPayload,
      });

      return {
        ok: true,
        processed: true,
        commentPosted: posted,
      };
    } catch (error) {
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.GithubApp,
        eventType: String(headers['x-github-event'] || 'pull_request'),
        status: WebhookEventStatus.Failed,
        resolvedUserId: identity.userId,
        externalIdentity,
        rawHeaders: headers,
        rawPayload,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async findSelectedProjectSlug(repoFullName: string, userId: string, workspaceSlug: string): Promise<string | null> {
    const normalizedRepoFullName = repoFullName.trim().toLowerCase();
    if (!normalizedRepoFullName) return null;
    if (!this.contentRepository) return 'inbox';
    const projects = await this.contentRepository.listProjects(userId);
    const project = projects.find(
      (item) => item.enabled && item.workspaceSlug === workspaceSlug && item.repositories.some(r => r.fullName.trim().toLowerCase() === normalizedRepoFullName),
    );
    return project?.projectSlug || null;
  }
}
