import { CanonicalType, EventType, KnowledgeKind, KnowledgeStatus, SourceChannel } from '../contracts/enums.js';
import { ingestPayloadSchema } from '../contracts/ingest.js';
import { defaultImportance } from '../domain/classification.js';
import { trimText } from '../domain/strings.js';
import { GithubIntegrationGateway } from './ports/integrations/github-integration.port.js';
import { ReviewAnalysisGateway } from './ports/projects/review-analysis.port.js';
import type { RuntimeEnvironment } from './ports/observability/runtime-environment.port.js';
import type { AppLogger } from '../observability/logger.js';
import type { GithubPushPayload, GithubPullRequestPayload, ChangedFile } from './models/github-webhook.models.js';
import {
  extractRepositoryInfo,
  normalizeProjectSlug,
  extractBranchName,
  buildAiConfig,
  extractChangedFilesFromCommits,
  isValidCommitSha,
  formatCorrelationId,
} from './utils/github-review.helpers.js';

// ============================================================================
// GitHub Push Review Event Builder
// ============================================================================

export async function buildGithubReviewEvent(
  rawInput: unknown,
  environment: RuntimeEnvironment,
  dependencies: {
    githubIntegrationGateway: GithubIntegrationGateway;
    reviewAnalysisGateway: ReviewAnalysisGateway;
    logger: AppLogger;
  },
  options?: { skipWebhookVerification?: boolean },
): Promise<ReturnType<typeof ingestPayloadSchema.parse>> {
  const input = rawInput as { headers?: Record<string, string>; body?: GithubPushPayload; rawBody?: string };
  const headers = input.headers || {};
  const body = input.body || {};
  const logger = dependencies.logger;

  const repoInfo = extractRepositoryInfo(body);
  const branch = extractBranchName(String(body.ref || ''));

  logger.info('github_review_activated', {
    repository: repoInfo.fullName,
    ref: body.ref,
    pusher: body.pusher?.name,
    headCommit: body.after,
  });

  verifyWebhookSignature(
    dependencies.githubIntegrationGateway,
    environment.githubWebhookSecret,
    input.rawBody,
    headers['x-hub-signature-256'],
    options?.skipWebhookVerification === true,
  );
  validatePushEvent(body);

  const githubToken = await fetchGithubToken(dependencies.githubIntegrationGateway, environment, body.installation?.id);
  const compare = await dependencies.githubIntegrationGateway.fetchComparePayload(
    repoInfo.fullName,
    String(body.before || ''),
    String(body.after || ''),
    githubToken,
  );
  const changedFiles = extractChangedFilesFromCommits(body.commits || []);

  const promptPayload = buildPushPromptPayload(repoInfo.fullName, branch, body, compare, changedFiles);

  logger.info('github_review_ai_payload', {
    repository: repoInfo.fullName,
    branch: promptPayload.branch,
    headCommitSha: promptPayload.headCommit.sha,
    commitsCount: promptPayload.commits.length,
    filesCount: promptPayload.files.length,
    aiProvider: environment.reviewAiProvider,
    aiModel: environment.reviewAiModel,
  });

  const analysis = await generateReviewAnalysis(
    dependencies.reviewAnalysisGateway,
    buildAiConfig(environment),
    promptPayload,
    logger,
    repoInfo.fullName,
    promptPayload.headCommit.sha,
  );

  const projectSlug = normalizeProjectSlug(repoInfo.name, repoInfo.fullName);

  return ingestPayloadSchema.parse({
    source: {
      channel: SourceChannel.Github,
      system: 'github',
      source: 'github push',
      actor: String(body.pusher?.name || ''),
      conversationId: repoInfo.fullName,
      correlationId: formatCorrelationId('push', repoInfo.fullName, String(body.after || Date.now())),
    },
    event: {
      type: EventType.CodeReview,
      occurredAt: String(body.head_commit?.timestamp || new Date().toISOString()),
      projectSlug,
    },
    content: {
      rawText: trimText(String(body.head_commit?.message || ''), 'Push without detailed message'),
      title: `[${repoInfo.name || repoInfo.fullName.split('/').pop() || 'inbox'}] ${String(body.head_commit?.message || 'Push without detailed message').split('\n')[0]}`,
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
      tags: ['code-review', projectSlug],
      decisionFlag: false,
    },
    actions: {
      reminderDate: '',
      reminderTime: '',
      followUpBy: '',
    },
    metadata: {
      repoFullName: repoInfo.fullName,
      branch,
      compareUrl: String(body.compare || ''),
      headSha: String(body.after || ''),
    },
    links: changedFiles,
  });
}

// ============================================================================
// GitHub Pull Request Review Event Builder
// ============================================================================

export async function buildGithubPrReviewEvent(
  rawInput: unknown,
  environment: RuntimeEnvironment,
  dependencies: {
    githubIntegrationGateway: GithubIntegrationGateway;
    reviewAnalysisGateway: ReviewAnalysisGateway;
    logger: AppLogger;
  },
  changedFiles: ChangedFile[],
  contextSummary?: string,
): Promise<ReturnType<typeof ingestPayloadSchema.parse>> {
  const input = rawInput as { headers?: Record<string, string>; body?: GithubPullRequestPayload; rawBody?: string };
  const body = input.body || {};
  const logger = dependencies.logger;

  const repoInfo = extractRepositoryInfo(body);
  const prNumber = Number(body.pull_request?.number || 0);

  logger.info('github_pr_review_activated', {
    repository: repoInfo.fullName,
    prNumber,
    action: body.action,
    sender: body.sender?.login,
  });

  const promptPayload = buildPrPromptPayload(repoInfo.fullName, body, changedFiles);

  logger.info('github_pr_review_ai_payload', {
    repository: repoInfo.fullName,
    prNumber,
    filesCount: changedFiles.length,
    aiProvider: environment.reviewAiProvider,
    aiModel: environment.reviewAiModel,
  });

  const analysis = await generateReviewAnalysis(
    dependencies.reviewAnalysisGateway,
    buildAiConfig(environment),
    promptPayload,
    logger,
    repoInfo.fullName,
    String(prNumber),
  );

  const projectSlug = normalizeProjectSlug(repoInfo.name, repoInfo.fullName);
  const rawText = buildPrRawText(prNumber, String(body.pull_request?.title || ''), String(body.pull_request?.body || ''), contextSummary);

  return ingestPayloadSchema.parse({
    source: {
      channel: SourceChannel.Github,
      system: 'github',
      source: 'github pull request',
      actor: String(body.sender?.login || ''),
      conversationId: repoInfo.fullName,
      correlationId: formatCorrelationId('pr', repoInfo.fullName, `${prNumber}:${String(body.pull_request?.head?.sha || '')}`),
    },
    event: {
      type: EventType.CodeReview,
      occurredAt: new Date().toISOString(),
      projectSlug,
    },
    content: {
      rawText: trimText(rawText, 'PR without description'),
      title: `[PR #${prNumber}] ${String(body.pull_request?.title || '')}`,
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
      tags: ['code-review', 'pull-request', projectSlug],
      decisionFlag: false,
    },
    actions: {
      reminderDate: '',
      reminderTime: '',
      followUpBy: '',
    },
    metadata: {
      repoFullName: repoInfo.fullName,
      prNumber,
      prTitle: String(body.pull_request?.title || ''),
      prUrl: String(body.pull_request?.html_url || ''),
      baseBranch: String(body.pull_request?.base?.ref || ''),
      headBranch: String(body.pull_request?.head?.ref || ''),
      baseSha: String(body.pull_request?.base?.sha || ''),
      headSha: String(body.pull_request?.head?.sha || ''),
    },
    links: changedFiles.map(f => f.filename),
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function verifyWebhookSignature(
  gateway: GithubIntegrationGateway,
  secret: string,
  rawBody: string | undefined,
  signature: string,
  skip = false,
): void {
  if (skip) return;
  gateway.verifyWebhookSignature(secret, String(rawBody || ''), String(signature || ''));
}

function validatePushEvent(body: GithubPushPayload): void {
  if (body.deleted || !isValidCommitSha(String(body.after || ''))) {
    throw new Error('deleted_ref_event');
  }
}

async function fetchGithubToken(
  gateway: GithubIntegrationGateway,
  environment: RuntimeEnvironment,
  installationId: string | number | undefined,
): Promise<string> {
  const id = String(installationId || '').trim();
  if (!id) return '';
  return gateway.fetchInstallationToken({
    appId: environment.githubAppId,
    privateKey: environment.githubAppPrivateKey,
    installationId: id,
  });
}

function buildPushPromptPayload(
  repoFullName: string,
  branch: string,
  body: GithubPushPayload,
  compare: { commits: unknown[]; files: unknown[] },
  changedFiles: string[],
) {
  return {
    repository: repoFullName,
    branch,
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
      : changedFiles.map((filename) => ({ filename, status: 'modified', patch: '' })),
  };
}

function buildPrPromptPayload(repoFullName: string, body: GithubPullRequestPayload, changedFiles: ChangedFile[]) {
  return {
    repository: repoFullName,
    pullRequest: {
      number: Number(body.pull_request?.number || 0),
      title: String(body.pull_request?.title || ''),
      description: String(body.pull_request?.body || ''),
      baseBranch: String(body.pull_request?.base?.ref || ''),
      headBranch: String(body.pull_request?.head?.ref || ''),
      baseSha: String(body.pull_request?.base?.sha || ''),
      headSha: String(body.pull_request?.head?.sha || ''),
      url: String(body.pull_request?.html_url || ''),
    },
    files: changedFiles,
  };
}

async function generateReviewAnalysis(
  gateway: ReviewAnalysisGateway,
  aiConfig: ReturnType<typeof buildAiConfig>,
  promptPayload: unknown,
  logger: AppLogger,
  repository: string,
  identifier: string,
) {
  try {
    const analysis = await gateway.generate(aiConfig, promptPayload);
    logger.info('github_review_ai_success', {
      repository,
      identifier,
      summaryLength: analysis.summary?.length || 0,
      findingsCount: analysis.reviewFindings?.length || 0,
    });
    return analysis;
  } catch (error) {
    logger.error('github_review_ai_failed', {
      repository,
      identifier,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function buildPrRawText(prNumber: number, title: string, description: string, contextSummary?: string): string {
  return `PR #${prNumber}: ${title}`;
}

export function buildGithubPrContextNoteEvent(
  rawInput: unknown,
  commentText: string,
  changedFiles: ChangedFile[],
  contextSummary?: string,
): ReturnType<typeof ingestPayloadSchema.parse> {
  const input = rawInput as { headers?: Record<string, string>; body?: GithubPullRequestPayload; rawBody?: string };
  const body = input.body || {};
  const repoInfo = extractRepositoryInfo(body);
  const prNumber = Number(body.pull_request?.number || 0);
  const projectSlug = normalizeProjectSlug(repoInfo.name, repoInfo.fullName);
  const rawText = buildPrRawText(prNumber, String(body.pull_request?.title || ''), String(body.pull_request?.body || ''), contextSummary);

  return ingestPayloadSchema.parse({
    source: {
      channel: SourceChannel.Github,
      system: 'github',
      source: 'github pull request',
      actor: String(body.sender?.login || ''),
      conversationId: repoInfo.fullName,
      correlationId: formatCorrelationId('pr', repoInfo.fullName, `${prNumber}:${String(body.pull_request?.head?.sha || '')}`),
    },
    event: {
      type: EventType.CodeReview,
      occurredAt: new Date().toISOString(),
      projectSlug,
    },
    content: {
      rawText: trimText(rawText, 'PR without description'),
      title: `[PR #${prNumber}] ${String(body.pull_request?.title || '')}`,
      attachments: [],
      sections: {
        summary: commentText,
        impact: '',
        risks: [],
        nextSteps: [],
        reviewFindings: [],
      },
    },
    classification: {
      kind: KnowledgeKind.Summary,
      canonicalType: CanonicalType.Knowledge,
      importance: defaultImportance(KnowledgeKind.Summary),
      status: KnowledgeStatus.Active,
      tags: ['code-review', 'pull-request', projectSlug],
      decisionFlag: false,
    },
    actions: {
      reminderDate: '',
      reminderTime: '',
      followUpBy: '',
    },
    metadata: {
      repoFullName: repoInfo.fullName,
      prNumber,
      prTitle: String(body.pull_request?.title || ''),
      prUrl: String(body.pull_request?.html_url || ''),
      baseBranch: String(body.pull_request?.base?.ref || ''),
      headBranch: String(body.pull_request?.head?.ref || ''),
      baseSha: String(body.pull_request?.base?.sha || ''),
      headSha: String(body.pull_request?.head?.sha || ''),
    },
    links: changedFiles.map(f => f.filename),
  });
}
