import { Injectable } from '@nestjs/common';

import { ExternalIdentityProvider, IntegrationProvider, WebhookEventStatus } from '../../../../contracts/enums.js';
import { AppErrorCode, ExternalIdentityNotFoundException, GithubAuthException } from '../../../../domain/exceptions/index.js';
import { buildTelegramCodeReviewMessage } from '../../../../domain/notifications.js';
import type { GithubPushWebhookRequest } from '../../../models/webhook-request.models.js';
import { GithubIntegrationGateway } from '../../../ports/integrations/github-integration.port.js';
import { ExternalIdentityRepository } from '../../../ports/integrations/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../../ports/observability/runtime-environment.port.js';
import { WebhookEventRepository } from '../../../ports/webhooks/webhook-events.repository.js';
import { ProcessGithubPushService } from '../../../services/integrations/process-github-push.service.js';
import { GithubRepositoryResolutionService } from '../../../services/integrations/github-repository-resolution.service.js';
import { normalizeHeaders } from '../../../utils/webhook/webhook.utils.js';
import { AppLogger } from '../../../../observability/logger.js';
import { githubAuditPayload, type GithubPushPayload } from '../../../utils/github/github-audit.utils.js';

type GithubPushAuditContext = {
  userId: string;
  headers: Record<string, string>;
  rawPayload: Record<string, unknown>;
  externalIdentity: { provider: ExternalIdentityProvider; identityType: string; externalId: string };
};

@Injectable()
export class HandleGithubPushUseCase {
  constructor(
    private readonly processGithubPushService: ProcessGithubPushService,
    private readonly externalIdentities: ExternalIdentityRepository,
    private readonly webhookEvents: WebhookEventRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly githubIntegrationGateway: GithubIntegrationGateway,
    private readonly githubRepositoryResolution: GithubRepositoryResolutionService,
    private readonly logger: AppLogger,
  ) {}

  async execute(input: GithubPushWebhookRequest, options?: { synchronous?: boolean }) {
    const environment = this.environmentProvider.read();
    const headers = normalizeHeaders(input.headers || {});
    const body = (input.body || {}) as GithubPushPayload;
    const rawPayload = githubAuditPayload(body);
    const installationId = String((body.installation as { id?: unknown } | undefined)?.id || '').trim();
    const externalIdentity = { provider: ExternalIdentityProvider.GithubApp, identityType: 'installation_id', externalId: installationId };

    this.logger.info('github_push_webhook_start', {
      installationId,
      repositoryFullName: rawPayload.repositoryFullName,
      repositoryId: rawPayload.repositoryId,
      ref: rawPayload.ref,
    });

    if (!environment.githubWebhookSecret) {
      this.logger.warn('github_push_webhook_secret_not_configured');
      throw new GithubAuthException(AppErrorCode.GithubWebhookSecretNotConfigured);
    }
    try {
      this.githubIntegrationGateway.verifyWebhookSignature(
        environment.githubWebhookSecret,
        String(input.rawBody || ''),
        String(headers['x-hub-signature-256'] || ''),
      );
    } catch (error) {
      this.logger.warn('github_push_webhook_signature_invalid', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new GithubAuthException(AppErrorCode.InvalidGithubSignature);
    }
    if (!installationId) {
      this.logger.warn('github_push_webhook_missing_installation_id');
      throw new GithubAuthException(AppErrorCode.MissingInstallationId);
    }
    const identity = await this.externalIdentities.findExternalIdentity(ExternalIdentityProvider.GithubApp, 'installation_id', installationId);
    if (!identity) {
      this.logger.warn('github_push_webhook_identity_not_found', { installationId });
      throw new ExternalIdentityNotFoundException();
    }

    this.logger.info('github_push_webhook_identity_resolved', {
      userId: identity.userId,
      workspaceSlug: identity.workspaceSlug,
    });

    const auditContext: GithubPushAuditContext = {
      userId: identity.userId,
      headers,
      rawPayload,
      externalIdentity,
    };

    await this.recordPushEvent(auditContext, WebhookEventStatus.Resolved);
    try {
      const repoFullName = String(body.repository?.full_name || '').trim();
      this.logger.info('github_push_webhook_resolving_project', {
        repoFullName,
        userId: identity.userId,
        workspaceSlug: identity.workspaceSlug,
      });

      const projectSlug = await this.githubRepositoryResolution.resolveProjectAndSyncRepoName({
        userId: identity.userId,
        workspaceSlug: identity.workspaceSlug || '',
        repositoryId: body.repository?.id || '0',
        repositoryFullName: repoFullName,
      });
      if (!projectSlug) {
        this.logger.warn('github_push_webhook_repository_not_selected', {
          repoFullName,
          userId: identity.userId,
        });
        await this.recordPushEvent(auditContext, WebhookEventStatus.Ignored, 'github_repository_not_selected');
        return {
          ok: true,
          processed: false,
          ignored: 'github_repository_not_selected',
        };
      }

      this.logger.info('github_push_webhook_project_resolved', {
        projectSlug,
        repoFullName,
      });

      if (options?.synchronous) {
        this.logger.info('github_push_webhook_processing_synchronous', { projectSlug });
        return this.processPush(input, identity, auditContext, projectSlug);
      }

      this.logger.info('github_push_webhook_queued', { projectSlug });
      void this.processPush(input, identity, auditContext, projectSlug);

      return {
        ok: true,
        processed: false,
        status: 'queued',
      };
    } catch (error) {
      await this.recordPushEvent(
        auditContext,
        WebhookEventStatus.Failed,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private async processPush(
    input: GithubPushWebhookRequest,
    identity: { userId: string; workspaceSlug?: string | null; credentialId?: string | null },
    auditContext: GithubPushAuditContext,
    projectSlug: string,
  ) {
    const body = (input.body || {}) as GithubPushPayload;
    const repoFullName = String(body.repository?.full_name || '').trim();

    this.logger.info('github_push_webhook_processing_start', {
      projectSlug,
      repoFullName,
      userId: identity.userId,
    });

    try {
      const result = await this.processGithubPushService.execute({
        body,
        headers: auditContext.headers,
        rawBody: input.rawBody,
        userId: identity.userId,
        workspaceSlug: identity.workspaceSlug || '',
        projectSlug,
        quotaSource: 'github_push_webhook',
      });

      if (!result.ok) {
        this.logger.warn('github_push_webhook_processing_skipped', {
          projectSlug,
          reason: result.skipped,
        });
        await this.recordPushEvent(auditContext, WebhookEventStatus.Ignored, result.skipped);
        return {
          ok: true,
          processed: false,
          ignored: result.skipped,
        };
      }

      this.logger.info('github_push_webhook_processing_success', {
        projectSlug,
        noteId: result.noteId,
      });

      await this.recordPushEvent(auditContext, WebhookEventStatus.Processed);
      return {
        ok: true,
        payload: result.payload,
        ingestResult: { noteId: result.noteId },
        telegramMessage: buildTelegramCodeReviewMessage(result.payload),
      };
    } catch (error) {
      this.logger.error('github_push_review_failed', {
        repository: repoFullName,
        projectSlug,
        error: error instanceof Error ? error.message : String(error),
      });
      await this.recordPushEvent(
        auditContext,
        WebhookEventStatus.Failed,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private recordPushEvent(
    context: GithubPushAuditContext,
    status: WebhookEventStatus,
    error?: string,
  ) {
    return this.webhookEvents.recordWebhookEvent({
      provider: IntegrationProvider.GithubApp,
      eventType: String(context.headers['x-github-event'] || 'push'),
      status,
      resolvedUserId: context.userId,
      externalIdentity: context.externalIdentity,
      rawHeaders: context.headers,
      rawPayload: context.rawPayload,
      ...(error !== undefined ? { error } : {}),
    });
  }
}
