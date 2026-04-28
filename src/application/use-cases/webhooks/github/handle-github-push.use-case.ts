import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { readEnvironment } from '../../../../adapters/environment.js';
import { verifyGithubSignature } from '../../../../adapters/github.js';
import { ExternalIdentityProvider, IntegrationProvider, WebhookEventStatus } from '../../../../contracts/enums.js';
import { buildTelegramCodeReviewMessage } from '../../../../domain/notifications.js';
import { buildGithubReviewEvent } from '../../../github-review.js';
import { ExternalIdentityRepository, WebhookEventRepository } from '../../../ports/repositories.js';
import { normalizeHeaders } from '../../../utils/webhook.utils.js';
import { IngestEntryUseCase } from '../../ingest/ingest-entry.use-case.js';

export type GithubPushWebhookRequest = {
  headers?: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
  rawBody?: string;
};

@Injectable()
export class HandleGithubPushUseCase {
  constructor(
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly externalIdentities: ExternalIdentityRepository,
    private readonly webhookEvents: WebhookEventRepository = externalIdentities as unknown as WebhookEventRepository,
  ) {}

  async execute(input: GithubPushWebhookRequest) {
    const environment = readEnvironment();
    const headers = normalizeHeaders(input.headers || {});
    const body = input.body || {};
    const installationId = String((body.installation as { id?: unknown } | undefined)?.id || '').trim();
    const externalIdentity = { provider: ExternalIdentityProvider.GithubApp, identityType: 'installation_id', externalId: installationId };
    if (!environment.githubWebhookSecret) {
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.GithubApp,
        eventType: String(headers['x-github-event'] || 'push'),
        status: WebhookEventStatus.Rejected,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
        error: 'github_webhook_secret_not_configured',
      });
      throw new UnauthorizedException('github_webhook_secret_not_configured');
    }
    try {
      verifyGithubSignature(environment.githubWebhookSecret, String(input.rawBody || ''), String(headers['x-hub-signature-256'] || ''));
    } catch (error) {
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.GithubApp,
        eventType: String(headers['x-github-event'] || 'push'),
        status: WebhookEventStatus.Rejected,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new UnauthorizedException('invalid_github_signature');
    }
    if (!installationId) {
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.GithubApp,
        eventType: String(headers['x-github-event'] || 'push'),
        status: WebhookEventStatus.Rejected,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
        error: 'missing_installation_id',
      });
      throw new UnauthorizedException('missing_installation_id');
    }
    const identity = await this.externalIdentities.findExternalIdentity(ExternalIdentityProvider.GithubApp, 'installation_id', installationId);
    if (!identity) {
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.GithubApp,
        eventType: String(headers['x-github-event'] || 'push'),
        status: WebhookEventStatus.Rejected,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
        error: 'identity_not_found',
      });
      throw new NotFoundException('identity_not_found');
    }
    await this.webhookEvents.recordWebhookEvent({
      provider: IntegrationProvider.GithubApp,
      eventType: String(headers['x-github-event'] || 'push'),
      status: WebhookEventStatus.Resolved,
      resolvedUserId: identity.userId,
      externalIdentity,
      rawHeaders: headers,
      rawPayload: body,
    });
    try {
      const payload = await buildGithubReviewEvent(input, environment);
      const ingestResult = await this.ingestEntryUseCase.execute(payload, identity.userId, identity.workspaceSlug);
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.GithubApp,
        eventType: String(headers['x-github-event'] || 'push'),
        status: WebhookEventStatus.Processed,
        resolvedUserId: identity.userId,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
      });
      return {
        ok: true,
        payload,
        ingestResult,
        telegramMessage: buildTelegramCodeReviewMessage(payload),
      };
    } catch (error) {
      await this.webhookEvents.recordWebhookEvent({
        provider: IntegrationProvider.GithubApp,
        eventType: String(headers['x-github-event'] || 'push'),
        status: WebhookEventStatus.Failed,
        resolvedUserId: identity.userId,
        externalIdentity,
        rawHeaders: headers,
        rawPayload: body,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
