import { slugify } from '../../../domain/strings.js';
import type { AiProvider } from '../../../contracts/enums.js';
import type { GithubPushPayload, GithubPullRequestPayload, GithubRepositoryInfo } from '../../models/github-webhook.models.js';
import { ReviewAnalysisConfig } from '../../ports/projects/review-analysis.port.js';
import { EmbeddingRepresentation } from '../../ports/notes/note-embedding.repository.js';
import { resolveContentScopeFromSlugs } from '../content/content-scope.utils.js';

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

/**
 * Checks if any review finding has high or critical severity
 */
export function hasHighSeverityReviewFindings(findings: Array<{ severity?: string }>): boolean {
  return findings.some((finding) => finding.severity === 'high' || finding.severity === 'critical');
}

export const GITHUB_COMMENT_CHAR_LIMIT = 65000;

/**
 * Checks if a PR comment was already posted for the given commit SHA
 */
export function isCommentForShaAlreadyPosted(comments: Array<{ body: string }>, headSha: string): boolean {
  const duplicateMarker = `<!-- sha: ${headSha} -->`;
  return comments.some((comment) => comment.body.includes(duplicateMarker));
}

/**
 * Checks if AI comment contains relevant content (not empty or NONE)
 */
export function isRelevantAiComment(commentText: string | null | undefined): commentText is string {
  if (!commentText) return false;
  const trimmed = commentText.trim();
  return trimmed !== '' && trimmed.toUpperCase() !== 'NONE';
}

/**
 * Formats PR comment appending SHA marker and truncates if exceeding GitHub comment limit
 */
export function formatPullRequestCommentWithSha(
  commentText: string,
  headSha: string,
): { comment: string; isTruncated: boolean } {
  const commentWithSha = `${commentText}\n\n<!-- sha: ${headSha} -->`;
  if (commentWithSha.length <= GITHUB_COMMENT_CHAR_LIMIT) {
    return { comment: commentWithSha, isTruncated: false };
  }
  const truncated =
    commentWithSha.substring(0, GITHUB_COMMENT_CHAR_LIMIT - 150) +
    '\n\n... [Comment truncated due to GitHub character limit] \n\n' +
    `<!-- sha: ${headSha} -->`;
  return { comment: truncated, isTruncated: true };
}

/**
 * Builds a markdown summary string from semantic context chunks
 */
export function buildPrContextSummary(
  contextChunks: Array<{ title: string; chunkText: string }>,
): string | undefined {
  if (contextChunks.length === 0) return undefined;
  return contextChunks.map((c) => `- ${c.title}: ${c.chunkText.substring(0, 200)}...`).join('\n');
}

/**
 * Re-binds payload projectSlug and adjusts classification tags for code-review
 */
export function resolvePayloadProject<T extends { event: { projectSlug: string }; classification: { tags: string[] } }>(
  payload: T,
  projectSlug: string,
): T {
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

export interface SemanticPrContextChunk {
  noteId: string;
  title: string;
  path: string;
  projectSlug: string;
  workspaceId: string;
  chunkText: string;
}

export async function searchSemanticPrContextChunks(
  deps: {
    embeddingQueue: { publishQueryEmbedding: (params: { userId: string; queryText: string }) => Promise<number[][]> };
    noteEmbeddingRepository: { findSimilar: (userId: string, embedding: number[], options: any) => Promise<Array<{ noteId: string; chunkText: string }>> };
    contentRepository: { getNotesByIds: (userId: string, ids: string[]) => Promise<Array<{ id: string; title: string; path: string; projectSlug?: string | null; workspaceId: string }>> };
    logger?: { info?: (event: string, meta?: Record<string, unknown>) => void; warn?: (event: string, meta?: Record<string, unknown>) => void };
  },
  params: {
    userId: string;
    workspaceSlug?: string | null;
    workspaceId?: string;
    searchTerms: string;
    minSimilarity: number;
    repository: string;
    projectSlug: string;
    prNumber?: number;
  },
): Promise<SemanticPrContextChunk[]> {
  if (!params.searchTerms) return [];

  const workspaceId = params.workspaceId || (params.workspaceSlug
    ? (await resolveContentScopeFromSlugs(deps.contentRepository as any, params.userId, { workspaceSlug: params.workspaceSlug }))?.workspaceId || ''
    : '');

  try {
    const embeddings = await deps.embeddingQueue.publishQueryEmbedding({
      userId: params.userId,
      queryText: params.searchTerms,
    });
    const prEmbedding = embeddings[0];

    if (!prEmbedding || prEmbedding.length === 0) return [];

    const similarChunks = await deps.noteEmbeddingRepository.findSimilar(params.userId, prEmbedding, {
      limit: 8,
      workspaceId: params.workspaceId || undefined,
      minSimilarity: params.minSimilarity,
      representation: EmbeddingRepresentation.Raw,
    });

    deps.logger?.info?.('github_pr_semantic_search_results', {
      repository: params.repository,
      projectSlug: params.projectSlug,
      prNumber: params.prNumber,
      similarChunksCount: similarChunks.length,
    });

    if (similarChunks.length === 0) return [];

    const noteIds = Array.from(new Set(similarChunks.map((c) => c.noteId)));
    const notes = await deps.contentRepository.getNotesByIds(params.userId, noteIds);
    const noteMap = new Map(notes.map((n) => [n.id, n]));

    return similarChunks
      .map((chunk) => {
        const note = noteMap.get(chunk.noteId);
        if (!note) return null;
        return {
          noteId: chunk.noteId,
          title: note.title,
          path: note.path,
          projectSlug: note.projectSlug || '',
          workspaceId: note.workspaceId,
          chunkText: chunk.chunkText,
        };
      })
      .filter((c): c is SemanticPrContextChunk => c !== null);
  } catch (error) {
    deps.logger?.warn?.('github_pr_rpc_embedding_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function ingestPrReviewNote(
  deps: {
    ingestEntryUseCase?: { execute: (payload: any, userId: string, workspaceSlug: string) => Promise<{ noteId?: string }> } | null;
    logger?: { info?: (event: string, meta?: Record<string, unknown>) => void; warn?: (event: string, meta?: Record<string, unknown>) => void; error?: (event: string, meta?: Record<string, unknown>) => void };
  },
  params: {
    input: any;
    commentText: string;
    changedFiles: any[];
    contextSummary?: string;
    projectSlug: string;
    identity: { userId: string; workspaceSlug?: string | null };
    repoFullName: string;
    prNumber: number;
    buildPrContextNoteEvent: (input: any, commentText: string, changedFiles: any[], contextSummary?: string) => any;
  },
): Promise<string | undefined> {
  deps.logger?.info?.('github_pr_review_note_ingest_start', {
    repository: params.repoFullName,
    projectSlug: params.projectSlug,
    prNumber: params.prNumber,
    commentLength: params.commentText?.length ?? 0,
    contextChunksCount: params.contextSummary ? params.contextSummary.split('\n').length : 0,
  });

  if (!deps.ingestEntryUseCase) {
    deps.logger?.warn?.('github_pr_review_note_skipped', {
      repository: params.repoFullName,
      projectSlug: params.projectSlug,
      reason: 'ingest_use_case_not_available',
    });
    return undefined;
  }

  try {
    const reviewPayload = params.buildPrContextNoteEvent(params.input, params.commentText, params.changedFiles, params.contextSummary);
    const resolvedPayload = resolvePayloadProject(reviewPayload, params.projectSlug);
    const ingestResult = await deps.ingestEntryUseCase.execute(resolvedPayload, params.identity.userId, params.identity.workspaceSlug || '');

    deps.logger?.info?.('github_pr_review_note_ingested', {
      repository: params.repoFullName,
      projectSlug: params.projectSlug,
      prNumber: params.prNumber,
      noteId: ingestResult.noteId,
    });

    return ingestResult.noteId;
  } catch (error) {
    deps.logger?.error?.('github_pr_review_note_failed', {
      repository: params.repoFullName,
      projectSlug: params.projectSlug,
      prNumber: params.prNumber,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}



