import { Injectable } from '@nestjs/common';

import { AiProvider, CredentialRecordStatus, IntegrationProvider } from '../../contracts/enums.js';
import { buildWhatsappHighSeverityCodeReviewMessage } from '../../domain/notifications.js';
import { buildGithubReviewEvent } from '../github-review.js';
import { formatCorrelationId } from '../utils/github-review.helpers.js';
import { ContentRepository } from '../ports/notes/content.repository.js';
import { NotifyHighSeverityFindingsService } from '../use-cases/notifications/notify-high-severity-findings.use-case.js';
import { GithubIntegrationGateway } from '../ports/integrations/github-integration.port.js';
import { CredentialRepository } from '../ports/integrations/integrations.repository.js';
import { WhatsappReplySender } from '../ports/integrations/whatsapp-reply.sender.js';
import { ReviewAnalysisGateway } from '../ports/projects/review-analysis.port.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { absoluteUrl } from '../utils/integration-status.utils.js';
import { resolveContentScopeFromSlugs } from '../utils/content-scope.utils.js';
import { IngestEntryUseCase } from '../use-cases/ingest/ingest-entry.use-case.js';
import { QuotaService } from './quota.service.js';
import { AiOperationType } from '../../domain/enums/plans.enums.js';
import { AppLogger } from '../../observability/logger.js';

type GithubPushPayload = {
  ref?: string;
  before?: string;
  after?: string;
  deleted?: boolean;
  installation?: { id?: string | number };
  repository?: {
    id?: string | number;
    full_name?: string;
    name?: string;
    private?: boolean;
  };
  pusher?: { name?: string };
  sender?: { login?: string };
  head_commit?: {
    id?: string;
    message?: string;
    timestamp?: string;
    url?: string;
  };
  commits?: Array<{ id?: string; message?: string; added?: string[]; modified?: string[]; removed?: string[] }>;
};

export type ProcessGithubPushInput = {
  body: GithubPushPayload;
  headers?: Record<string, string>;
  rawBody?: string;
  userId: string;
  workspaceSlug: string;
  projectSlug: string;
  skipWebhookVerification?: boolean;
  quotaSource?: string;
};

@Injectable()
export class ProcessGithubPushService {
  private readonly logger: AppLogger;

  constructor(
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly githubIntegrationGateway: GithubIntegrationGateway,
    private readonly reviewAnalysisGateway: ReviewAnalysisGateway,
    private readonly quotaService: QuotaService,
    private readonly contentRepository: ContentRepository,
    private readonly credentials?: CredentialRepository,
    private readonly whatsappReplySender?: WhatsappReplySender,
    private readonly notifyHighSeverity?: NotifyHighSeverityFindingsService,
  ) {
    this.logger = AppLogger.create();
  }

  async execute(input: ProcessGithubPushInput) {
    const environment = this.environmentProvider.read();
    const body = input.body;
    const repoFullName = String(body.repository?.full_name || '').trim();
    const headers = input.headers || { 'x-github-event': 'push' };

    const quotaOk = await this.quotaService.checkAndIncrementAiUsage(
      input.userId,
      AiOperationType.GITHUB_CODE_REVIEW,
      { repoFullName, source: input.quotaSource || 'github_push' },
    ).then((r) => r.allowed);

    if (!quotaOk) {
      return {
        ok: false as const,
        skipped: 'quota_exceeded' as const,
        repository: repoFullName,
      };
    }

    const aiCredential = this.credentials
      ? await this.credentials.findCredential(input.userId, input.workspaceSlug, IntegrationProvider.AiReview)
      : null;
    const aiEnabled = Boolean(aiCredential && aiCredential.status === CredentialRecordStatus.Connected && !aiCredential.revokedAt);

    this.logger.info('github_push_review_start', {
      repository: repoFullName,
      projectSlug: input.projectSlug,
      aiEnabled,
      quotaOk,
      userId: input.userId,
      source: input.quotaSource || 'github_push',
    });

    const webhookInput = {
      headers,
      body,
      rawBody: input.rawBody || '',
    };

    const payload = await buildGithubReviewEvent(
      webhookInput,
      aiEnabled ? environment : { ...environment, reviewAiProvider: AiProvider.None, reviewAiApiKey: '' },
      {
        githubIntegrationGateway: this.githubIntegrationGateway,
        reviewAnalysisGateway: this.reviewAnalysisGateway,
        logger: this.logger,
      },
      { skipWebhookVerification: input.skipWebhookVerification === true },
    );

    const resolvedPayload = this.resolvePayloadProject(payload, input.projectSlug);

    this.logger.info('github_push_review_ingest_start', {
      repository: repoFullName,
      projectSlug: input.projectSlug,
      findingsCount: resolvedPayload.content.sections.reviewFindings.length,
    });

    const ingestResult = await this.ingestEntryUseCase.execute(resolvedPayload, input.userId, input.workspaceSlug);

    this.logger.info('github_push_review_ingested', {
      repository: repoFullName,
      projectSlug: input.projectSlug,
      noteId: ingestResult.noteId,
      findingsCount: resolvedPayload.content.sections.reviewFindings.length,
    });

    await this.notifyWhatsappOnHighSeverityFindings(
      resolvedPayload,
      input.userId,
      input.workspaceSlug,
      ingestResult.noteId,
      environment.publicBaseUrl,
    );

    if (this.notifyHighSeverity) {
      const hasHighSeverityFinding = resolvedPayload.content.sections.reviewFindings.some((finding) =>
        ['high', 'critical'].includes(finding.severity),
      );
      if (hasHighSeverityFinding) {
        const noteLink = ingestResult.noteId && environment.publicBaseUrl
          ? absoluteUrl(environment.publicBaseUrl, `/vault/${encodeURIComponent(ingestResult.noteId)}`)
          : '';
        void this.notifyHighSeverity.sendEmailForHighFindings(resolvedPayload, input.userId, noteLink);
      }
    }

    return {
      ok: true as const,
      noteId: ingestResult.noteId,
      repository: repoFullName,
      headSha: String(body.after || ''),
      payload: resolvedPayload,
    };
  }

  async noteExistsForPush(userId: string, repoFullName: string, afterSha: string): Promise<boolean> {
    const correlationId = formatCorrelationId('push', repoFullName, afterSha);
    const existing = await this.contentRepository.getNoteByPath(userId, correlationId);
    return Boolean(existing);
  }

  async findProjectSlugForRepo(userId: string, workspaceSlug: string, repoFullName: string): Promise<string | null> {
    const normalizedRepoFullName = repoFullName.trim().toLowerCase();
    if (!normalizedRepoFullName) return null;
    const projects = await this.contentRepository.listProjects(userId);
    const project = projects.find(
      (item) => item.enabled
        && item.workspaceSlug === workspaceSlug
        && item.repositories.some((repo) => repo.fullName.trim().toLowerCase() === normalizedRepoFullName),
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
        tags: [...new Set(['code-review', ...payload.classification.tags.filter((tag) => tag !== payload.event.projectSlug)])],
      },
    };
  }

  private async notifyWhatsappOnHighSeverityFindings(
    payload: Awaited<ReturnType<typeof buildGithubReviewEvent>>,
    userId: string,
    workspaceSlug: string,
    noteId: string,
    noteBaseUrl: string,
  ): Promise<{ sent: boolean; skipped?: string; error?: string }> {
    const hasHighSeverityFinding = payload.content.sections.reviewFindings.some((finding) => ['high', 'critical'].includes(finding.severity));
    if (!hasHighSeverityFinding) return { sent: false, skipped: 'no_high_severity_findings' };
    if (!this.credentials || !this.whatsappReplySender) return { sent: false, skipped: 'whatsapp_not_configured' };

    const credential = await this.credentials.findCredential(userId, workspaceSlug, IntegrationProvider.Whatsapp);
    const connected = Boolean(credential && credential.status === CredentialRecordStatus.Connected && !credential.revokedAt);
    if (!connected) return { sent: false, skipped: 'whatsapp_not_connected' };

    const { workspace } = await resolveContentScopeFromSlugs(this.contentRepository, userId, { workspaceSlug });
    const chatJid = String(workspace?.whatsappChatJid || '').trim();
    if (!chatJid) return { sent: false, skipped: 'whatsapp_chat_not_bound' };
    const noteLink = noteId && noteBaseUrl ? absoluteUrl(noteBaseUrl, `/vault/${encodeURIComponent(noteId)}`) : '';

    try {
      const result = await this.whatsappReplySender.sendText({
        chatJid,
        text: buildWhatsappHighSeverityCodeReviewMessage(payload, noteLink),
      });
      return result.ok
        ? { sent: true }
        : { sent: false, error: result.error || 'whatsapp_send_failed' };
    } catch (error) {
      return { sent: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
