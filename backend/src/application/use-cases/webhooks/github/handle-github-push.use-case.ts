import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { AiProvider, CredentialRecordStatus, ExternalIdentityProvider, IntegrationProvider, WebhookEventStatus } from '../../../../contracts/enums.js';
import { buildTelegramCodeReviewMessage } from '../../../../domain/notifications.js';
import { buildGithubReviewEvent } from '../../../github-review.js';
import type { GithubPushWebhookRequest } from '../../../models/webhook-request.models.js';
import { ContentRepository } from '../../../ports/notes/content.repository.js';
import { GithubIntegrationGateway } from '../../../ports/integrations/github-integration.port.js';
import { CredentialRepository, ExternalIdentityRepository } from '../../../ports/integrations/integrations.repository.js';
import { ReviewAnalysisGateway } from '../../../ports/projects/review-analysis.port.js';
import { RuntimeEnvironmentProvider } from '../../../ports/observability/runtime-environment.port.js';
import { WebhookEventRepository } from '../../../ports/webhooks/webhook-events.repository.js';
import { normalizeHeaders } from '../../../utils/webhook.utils.js';
import { IngestEntryUseCase } from '../../ingest/ingest-entry.use-case.js';

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
      const projectSlug = await this.findSelectedProjectSlug(repoFullName, identity.userId, identity.workspaceSlug);
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
      const resolvedPayload = this.resolvePayloadProject(payload, projectSlug);
      const ingestResult = await this.ingestEntryUseCase.execute(resolvedPayload, identity.userId, identity.workspaceSlug);
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

  private resolvePayloadProject<T extends Awaited<ReturnType<typeof buildGithubReviewEvent>>>(payload: T, projectSlug: string): T {
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
