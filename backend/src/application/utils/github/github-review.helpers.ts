import { slugify } from '../../../domain/strings.js';
import type { AiProvider } from '../../../contracts/enums.js';
import type { GithubPushPayload, GithubPullRequestPayload, GithubRepositoryInfo } from '../../models/github-webhook.models.js';
import { ReviewAnalysisConfig } from '../../ports/projects/review-analysis.port.js';

/**
 * Extracts repository information from a GitHub webhook payload
 */
export function extractRepositoryInfo(payload: GithubPushPayload | GithubPullRequestPayload): GithubRepositoryInfo {
  return {
    fullName: String(payload.repository?.full_name || '').trim(),
    name: String(payload.repository?.name || '').trim(),
    private: payload.repository?.private === true,
    id: payload.repository?.id || '',
  };
}

/**
 * Normalizes project slug from repository name
 */
export function normalizeProjectSlug(repositoryName: string, repositoryFullName: string): string {
  return slugify(repositoryName || repositoryFullName.split('/').pop() || 'inbox') || 'inbox';
}

/**
 * Extracts branch name from ref (e.g., refs/heads/main -> main)
 */
export function extractBranchName(ref: string): string {
  return String(ref || '').replace(/^refs\/heads\//, '') || 'main';
}

/**
 * Builds AI configuration from environment
 */
export function buildAiConfig(
  environment: {
    reviewAiProvider: AiProvider;
    reviewAiBaseUrl: string;
    reviewAiModel: string;
    reviewAiApiKey: string;
  },
): ReviewAnalysisConfig {
  return {
    provider: environment.reviewAiProvider,
    baseUrl: environment.reviewAiBaseUrl,
    model: environment.reviewAiModel,
    apiKey: environment.reviewAiApiKey,
  };
}

/**
 * Extracts changed files from commits
 */
export function extractChangedFilesFromCommits(commits: Array<{ added?: string[]; modified?: string[]; removed?: string[] }>): string[] {
  return Array.from(
    new Set(
      commits.flatMap((commit) => [
        ...(commit.added || []),
        ...(commit.modified || []),
        ...(commit.removed || []),
      ]),
    ),
  );
}

/**
 * Validates that a commit SHA is not deleted or zeroed
 */
export function isValidCommitSha(sha: string): boolean {
  return !/^0+$/.test(String(sha || ''));
}

/**
 * Formats correlation ID for GitHub events
 */
export function formatCorrelationId(type: 'push' | 'pr', repoFullName: string, identifier: string): string {
  return `${type}:${repoFullName}:${identifier}`;
}
