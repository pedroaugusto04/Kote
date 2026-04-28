import { generateReviewAnalysis } from '../adapters/ai.js';
import type { RuntimeEnvironment } from '../adapters/environment.js';
import { fetchComparePayload, verifyGithubSignature } from '../adapters/github.js';
import { CanonicalType, EventType, KnowledgeKind, KnowledgeStatus, SourceChannel } from '../contracts/enums.js';
import { ingestPayloadSchema } from '../contracts/ingest.js';
import { defaultImportance } from '../domain/classification.js';
import { slugify, trimText } from '../domain/strings.js';

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
};

function normalizeProjectSlug(payload: GithubPushPayload): string {
  return slugify(payload.repository?.name || payload.repository?.full_name?.split('/').pop() || 'inbox') || 'inbox';
}

export async function buildGithubReviewEvent(
  rawInput: unknown,
  environment: RuntimeEnvironment,
): Promise<ReturnType<typeof ingestPayloadSchema.parse>> {
  const input = rawInput as { headers?: Record<string, string>; body?: GithubPushPayload; rawBody?: string };
  const headers = input.headers || {};
  const body = input.body || {};
  verifyGithubSignature(environment.githubWebhookSecret, String(input.rawBody || ''), String(headers['x-hub-signature-256'] || ''));

  if (body.deleted || /^0+$/.test(String(body.after || ''))) {
    throw new Error('deleted_ref_event');
  }

  const repoFullName = String(body.repository?.full_name || '').trim();
  const compare = await fetchComparePayload(repoFullName, String(body.before || ''), String(body.after || ''), environment.githubApiToken);
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
      message: trimText(String(body.head_commit?.message || ''), 'sem mensagem'),
      url: String(body.head_commit?.url || ''),
    },
    commits: compare.commits.length
      ? compare.commits
      : (body.commits || []).map((commit) => ({
          sha: String(commit.id || ''),
          message: trimText(String(commit.message || ''), 'sem mensagem'),
        })),
    files: compare.files.length
      ? compare.files
      : changedFiles.map((filename) => ({
          filename,
          status: 'modified',
          patch: '',
        })),
  };

  const analysis = await generateReviewAnalysis(
    {
      provider: environment.reviewAiProvider,
      baseUrl: environment.reviewAiBaseUrl,
      model: environment.reviewAiModel,
      apiKey: environment.reviewAiApiKey,
    },
    promptPayload,
  );

  return ingestPayloadSchema.parse({
    schemaVersion: 1,
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
      rawText: trimText(String(body.head_commit?.message || ''), 'Push sem mensagem detalhada'),
      title: `Review ${repoFullName} ${String(body.after || '').slice(0, 8)}`,
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
      compareUrl: String(body.compare || ''),
      changedFiles,
      headSha: String(body.after || ''),
    },
  });
}
