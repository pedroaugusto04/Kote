import { CanonicalType, EventType, KnowledgeKind, KnowledgeStatus, SourceChannel } from '../contracts/enums.js';
import { ingestPayloadSchema } from '../contracts/ingest.js';
import { defaultImportance } from '../domain/classification.js';
import { slugify, trimText } from '../domain/strings.js';
import { GithubIntegrationGateway } from './ports/integrations/github-integration.port.js';
import { ReviewAnalysisGateway } from './ports/projects/review-analysis.port.js';
import type { RuntimeEnvironment } from './ports/observability/runtime-environment.port.js';

type GithubPushPayload = {
  ref?: string;
  before?: string;
  after?: string;
  compare?: string;
  deleted?: boolean;
  repository?: {
    full_name?: string;
    name?: string;
    html_url?: string;
  };
  pusher?: {
    name?: string;
  };
  head_commit?: {
    message?: string;
    timestamp?: string;
    url?: string;
  };
  commits?: Array<{
    id?: string;
    message?: string;
    added?: string[];
    modified?: string[];
    removed?: string[];
  }>;
  installation?: {
    id?: string | number;
  };
};

function normalizeProjectSlug(payload: GithubPushPayload): string {
  return slugify(payload.repository?.name || payload.repository?.full_name?.split('/').pop() || 'inbox') || 'inbox';
}

export async function buildGithubReviewEvent(
  rawInput: unknown,
  environment: RuntimeEnvironment,
  dependencies: {
    githubIntegrationGateway: GithubIntegrationGateway;
    reviewAnalysisGateway: ReviewAnalysisGateway;
  },
): Promise<ReturnType<typeof ingestPayloadSchema.parse>> {
  const input = rawInput as { headers?: Record<string, string>; body?: GithubPushPayload; rawBody?: string };
  const headers = input.headers || {};
  const body = input.body || {};
  dependencies.githubIntegrationGateway.verifyWebhookSignature(
    environment.githubWebhookSecret,
    String(input.rawBody || ''),
    String(headers['x-hub-signature-256'] || ''),
  );

  if (body.deleted || /^0+$/.test(String(body.after || ''))) {
    throw new Error('deleted_ref_event');
  }

  const repoFullName = String(body.repository?.full_name || '').trim();
  const installationId = String(body.installation?.id || '').trim();
  const githubToken = installationId
    ? await dependencies.githubIntegrationGateway.fetchInstallationToken({
      appId: environment.githubAppId,
      privateKey: environment.githubAppPrivateKey,
      installationId,
    })
    : '';
  const compare = await dependencies.githubIntegrationGateway.fetchComparePayload(
    repoFullName,
    String(body.before || ''),
    String(body.after || ''),
    githubToken,
  );
  const changedFiles = Array.from(
    new Set(
      (body.commits || []).flatMap((commit) => [
        ...(commit.added || []),
        ...(commit.modified || []),
        ...(commit.removed || []),
      ]),
    ),
  );

  const promptPayload = {
    repository: repoFullName,
    branch: String(body.ref || '').replace(/^refs\/heads\//, '') || 'main',
    headCommit: {
      sha: String(body.after || ''),
      message: trimText(String(body.head_commit?.message || ''), 'no message'),
      url: String(body.head_commit?.url || ''),
    },
    commits: compare.commits.length
      ? compare.commits
      : (body.commits || []).map((commit) => ({
          sha: String(commit.id || ''),
          message: trimText(String(commit.message || ''), 'no message'),
        })),
    files: compare.files.length
      ? compare.files
      : changedFiles.map((filename) => ({
          filename,
          status: 'modified',
          patch: '',
        })),
  };

  const analysis = await dependencies.reviewAnalysisGateway.generate(
    {
      provider: environment.reviewAiProvider,
      baseUrl: environment.reviewAiBaseUrl,
      model: environment.reviewAiModel,
      apiKey: environment.reviewAiApiKey,
    },
    promptPayload,
  );

  return ingestPayloadSchema.parse({
    source: {
      channel: SourceChannel.GithubPush,
      system: 'github-webhook',
      actor: String(body.pusher?.name || ''),
      conversationId: repoFullName,
      correlationId: `push:${repoFullName}:${body.after || Date.now()}`,
    },
    event: {
      type: EventType.CodeReview,
      occurredAt: String(body.head_commit?.timestamp || new Date().toISOString()),
      projectSlug: normalizeProjectSlug(body),
    },
    content: {
      rawText: trimText(String(body.head_commit?.message || ''), 'Push without detailed message'),
      title: `[${body.repository?.name || repoFullName.split('/').pop() || 'inbox'}] ${String(body.head_commit?.message || 'Push without detailed message').split('\n')[0]}`,
      attachments: [],
      sections: {
        summary: analysis.summary,
        impact: analysis.impact,
        risks: analysis.risks,
        nextSteps: analysis.nextSteps,
        reviewFindings: analysis.reviewFindings,
      },
    },
    classification: {
      kind: KnowledgeKind.Summary,
      canonicalType: CanonicalType.Knowledge,
      importance: defaultImportance(KnowledgeKind.Summary),
      status: KnowledgeStatus.Active,
      tags: ['code-review', normalizeProjectSlug(body)],
      decisionFlag: false,
    },
    actions: {
      reminderDate: '',
      reminderTime: '',
      followUpBy: '',
    },
    metadata: {
      repoFullName,
      branch: String(body.ref || '').replace(/^refs\/heads\//, '') || 'main',
      compareUrl: String(body.compare || ''),
      changedFiles,
      headSha: String(body.after || ''),
    },
  });
}
