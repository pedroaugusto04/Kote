import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { ExternalIdentityProvider, IntegrationProvider, WebhookEventStatus } from '../../../../contracts/enums.js';
import { buildTelegramCodeReviewMessage } from '../../../../domain/notifications.js';
import type { GithubPushWebhookRequest } from '../../../models/webhook-request.models.js';
import { GithubIntegrationGateway } from '../../../ports/integrations/github-integration.port.js';
import { ExternalIdentityRepository } from '../../../ports/integrations/integrations.repository.js';
import { RuntimeEnvironmentProvider } from '../../../ports/observability/runtime-environment.port.js';
import { WebhookEventRepository } from '../../../ports/webhooks/webhook-events.repository.js';
import { ProcessGithubPushService } from '../../../services/process-github-push.service.js';
import { GithubRepositoryResolutionService } from '../../../services/github-repository-resolution.service.js';
import { normalizeHeaders } from '../../../utils/webhook.utils.js';
import { AppLogger } from '../../../../observability/logger.js';

type GithubPushPayload = {
  ref?: string;
  before?: string;
  after?: string;
  deleted?: boolean;
  installation?: { id?: string | number };
  repository?: {
    id?: string | number;
    full_name?: string;
    private?: boolean;
  };
  pusher?: { name?: string };
  sender?: { login?: string };
};

function githubAuditPayload(body: GithubPushPayload): Record<string, unknown> {
  return {
    installationId: body.installation?.id == null ? '' : String(body.installation.id),
    repositoryId: body.repository?.id == null ? '' : String(body.repository.id),
    repositoryFullName: String(body.repository?.full_name || '').trim(),
    repositoryPrivate: body.repository?.private === true,
    ref: String(body.ref || ''),
    before: String(body.before || ''),
    after: String(body.after || ''),
    deleted: body.deleted === true,
    pusherName: String(body.pusher?.name || ''),
    senderLogin: String(body.sender?.login || ''),
  };
}

@Injectable()
export class HandleGithubPushUseCase {
  private readonly logger: AppLogger;

  constructor(
    private readonly processGithubPushService: ProcessGithubPushService,
    private readonly externalIdentities: ExternalIdentityRepository,
    private readonly webhookEvents: WebhookEventRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly githubIntegrationGateway: GithubIntegrationGateway,
    private readonly githubRepositoryResolution: GithubRepositoryResolutionService,
  ) {
    this.logger = AppLogger.create();
  }

  async execute(input: GithubPushWebhookRequest, options?: { synchronous?: boolean }) {
    const environment = this.environmentProvider.read();
    const headers = normalizeHeaders(input.headers || {});
    const body = (input.body || {}) as GithubPushPayload;
    const rawPayload = githubAuditPayload(body);
    const installationId = String((body.installation as { id?: unknown } | undefined)?.id || '').trim();
    const externalIdentity = { provider: ExternalIdentityProvider.GithubApp, identityType: 'installation_id', externalId: installationId };
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
    await this.webhookEvents.recordWebhookEvent({
      provider: IntegrationProvider.GithubApp,
      eventType: String(headers['x-github-event'] || 'push'),
      status: WebhookEventStatus.Resolved,
      resolvedUserId: identity.userId,
      externalIdentity,
      rawHeaders: headers,
      rawPayload,
    });
    try {
      const repoFullName = String(body.repository?.full_name || '').trim();
      const projectSlug = await this.githubRepositoryResolution.resolveProjectAndSyncRepoName({
        userId: identity.userId,
        workspaceSlug: identity.workspaceSlug || '',
        repositoryId: body.repository?.id || '0',
        repositoryFullName: repoFullName,
      });
      if (!projectSlug) {
        await this.webhookEvents.recordWebhookEvent({
          provider: IntegrationProvider.GithubApp,
          eventType: String(headers['x-github-event'] || 'push'),
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

      if (options?.synchronous) {
        return this.processPush(input, identity, headers, rawPayload, externalIdentity, projectSlug);
      }

      void this.processPush(input, identity, headers, rawPayload, externalIdentity, projectSlug);

      return {
        ok: true,
        processed: false,
        status: 'queued',
      };
    } catch (error) {
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.GithubApp,
        eventType: String(headers['x-github-event'] || 'push'),
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

  private async processPush(
    input: GithubPushWebhookRequest,
    identity: { userId: string; workspaceSlug?: string | null; credentialId?: string | null },
    headers: Record<string, string>,
    rawPayload: Record<string, unknown>,
    externalIdentity: { provider: ExternalIdentityProvider; identityType: string; externalId: string },
    projectSlug: string,
  ) {
    const body = (input.body || {}) as GithubPushPayload;
    const repoFullName = String(body.repository?.full_name || '').trim();

    try {
      const result = await this.processGithubPushService.execute({
        body,
        headers,
        userId: identity.userId,
        workspaceSlug: identity.workspaceSlug || '',
        projectSlug,
        quotaSource: 'github_push_webhook',
      });

      if (!result.ok) {
        await this.webhookEvents.recordWebhookEvent({
          provider: IntegrationProvider.GithubApp,
          eventType: String(headers['x-github-event'] || 'push'),
          status: WebhookEventStatus.Ignored,
          resolvedUserId: identity.userId,
          externalIdentity,
          rawHeaders: headers,
          rawPayload,
          error: result.skipped,
        });
        return {
          ok: true,
          processed: false,
          ignored: result.skipped,
        };
      }

      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.GithubApp,
        eventType: String(headers['x-github-event'] || 'push'),
        status: WebhookEventStatus.Processed,
        resolvedUserId: identity.userId,
        externalIdentity,
        rawHeaders: headers,
        rawPayload,
      });
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
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.GithubApp,
        eventType: String(headers['x-github-event'] || 'push'),
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
}
