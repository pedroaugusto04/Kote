import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { AiProvider, CredentialRecordStatus, ExternalIdentityProvider, IntegrationProvider, WebhookEventStatus } from '../../../../contracts/enums.js';
import { buildTelegramCodeReviewMessage } from '../../../../domain/notifications.js';
import { buildGithubReviewEvent } from '../../../github-review.js';
import type { GithubPushWebhookRequest } from '../../../models/webhook-request.models.js';
import { ContentRepository } from '../../../ports/content.repository.js';
import { GithubIntegrationGateway } from '../../../ports/github-integration.port.js';
import { CredentialRepository, ExternalIdentityRepository } from '../../../ports/integrations.repository.js';
import { ReviewAnalysisGateway } from '../../../ports/review-analysis.port.js';
import { RuntimeEnvironmentProvider } from '../../../ports/runtime-environment.port.js';
import { WebhookEventRepository } from '../../../ports/webhook-events.repository.js';
import { normalizeHeaders } from '../../../utils/webhook.utils.js';
import { IngestEntryUseCase } from '../../ingest/ingest-entry.use-case.js';

@Injectable()
export class HandleGithubPushUseCase {
  constructor(
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly externalIdentities: ExternalIdentityRepository,
    private readonly webhookEvents: WebhookEventRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly githubIntegrationGateway: GithubIntegrationGateway,
    private readonly reviewAnalysisGateway: ReviewAnalysisGateway,
    private readonly contentRepository?: ContentRepository,
    private readonly credentials?: CredentialRepository,
  ) {}

  async execute(input: GithubPushWebhookRequest) {
    const environment = this.environmentProvider.read();
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
      this.githubIntegrationGateway.verifyWebhookSignature(
        environment.githubWebhookSecret,
        String(input.rawBody || ''),
        String(headers['x-hub-signature-256'] || ''),
      );
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
      const aiCredential = this.credentials
        ? await this.credentials.findCredential(identity.userId, identity.workspaceSlug, IntegrationProvider.AiReview)
        : null;
      const aiEnabled = Boolean(aiCredential && aiCredential.status === CredentialRecordStatus.Connected && !aiCredential.revokedAt);
      const payload = await buildGithubReviewEvent(
        input,
        aiEnabled ? environment : { ...environment, reviewAiProvider: AiProvider.None, reviewAiApiKey: '' },
        {
          githubIntegrationGateway: this.githubIntegrationGateway,
          reviewAnalysisGateway: this.reviewAnalysisGateway,
        },
      );
      const resolvedPayload = await this.resolveProjectForPayload(payload, identity.userId, identity.workspaceSlug);
      const ingestResult = await this.ingestEntryUseCase.execute(resolvedPayload, identity.userId, identity.workspaceSlug);
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
        payload: resolvedPayload,
        ingestResult,
        telegramMessage: buildTelegramCodeReviewMessage(resolvedPayload),
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

  private async resolveProjectForPayload<T extends Awaited<ReturnType<typeof buildGithubReviewEvent>>>(payload: T, userId: string, workspaceSlug: string): Promise<T> {
    if (!this.contentRepository) return payload;
    const repoFullName = String(payload.metadata.repoFullName || '').trim().toLowerCase();
    if (!repoFullName) return payload;
    const projects = await this.contentRepository.listProjects(userId);
    const project = projects.find(
      (item) => item.enabled && item.workspaceSlug === workspaceSlug && item.repositories.some(r => r.fullName.trim().toLowerCase() === repoFullName),
    );
    const projectSlug = project?.projectSlug || 'inbox';
    return {
      ...payload,
      event: {
        ...payload.event,
        projectSlug,
      },
      classification: {
        ...payload.classification,
        tags: [...new Set(['code-review', projectSlug, ...payload.classification.tags.filter((tag) => tag !== payload.event.projectSlug)])],
      },
    };
  }
}
