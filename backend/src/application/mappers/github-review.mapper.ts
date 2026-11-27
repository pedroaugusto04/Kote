import { CanonicalType, EventType, KnowledgeKind, SourceChannel } from '../../contracts/enums.js';
import type { IngestPayload } from '../../contracts/ingest.js';
import { defaultImportance } from '../../domain/classification.js';
import { trimText } from '../../domain/strings.js';
import { normalizeOccurredAtToUtc } from '../../domain/time.js';
import type {
  ChangedFile,
  GithubPullRequestPayload,
  GithubPushPayload,
  GithubRepositoryInfo,
} from '../models/github-webhook.models.js';
import type { ReviewAnalysis } from '../ports/projects/review-analysis.port.js';
import { formatCorrelationId } from '../utils/github/github-review.helpers.js';
import { buildIngestPayload } from './ingest.mapper.js';

export interface GithubPushReviewMapperParams {
  body: GithubPushPayload;
  repoInfo: GithubRepositoryInfo;
  branch: string;
  projectSlug: string;
  analysis: ReviewAnalysis;
  changedFiles: string[];
}

export interface GithubPrContextNoteMapperParams {
  body: GithubPullRequestPayload;
  repoInfo: GithubRepositoryInfo;
  prNumber: number;
  projectSlug: string;
  rawText: string;
  commentText: string;
  changedFiles: ChangedFile[];
}

export class GithubReviewMapper {
  static toPushIngestPayload(params: GithubPushReviewMapperParams): IngestPayload {
    const { body, repoInfo, branch, projectSlug, analysis, changedFiles } = params;
    const headMessage = String(body.head_commit?.message || '');
    const repoLabel = repoInfo.name || repoInfo.fullName.split('/').pop() || 'inbox';
    const titleHeadline = String(body.head_commit?.message || 'Push without detailed message').split('\n')[0];

    return buildIngestPayload({
      source: {
        channel: SourceChannel.Github,
        system: 'github',
        conversationId: repoInfo.fullName,
        correlationId: formatCorrelationId('push', repoInfo.fullName, String(body.after || Date.now())),
      },
      event: {
        type: EventType.CodeReview,
        occurredAt: normalizeOccurredAtToUtc(body.head_commit?.timestamp),
        projectSlug,
      },
      content: {
        rawText: trimText(headMessage, 'Push without detailed message'),
        title: `[${repoLabel}] ${titleHeadline}`,
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
        tags: ['code-review', projectSlug],
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

  static toPrContextNoteIngestPayload(params: GithubPrContextNoteMapperParams): IngestPayload {
    const { body, repoInfo, prNumber, projectSlug, rawText, commentText, changedFiles } = params;
    const pullRequest = body.pull_request;
    const prTitle = String(pullRequest?.title || '');
    const headSha = String(pullRequest?.head?.sha || '');

    return buildIngestPayload({
      source: {
        channel: SourceChannel.Github,
        system: 'github',
        conversationId: repoInfo.fullName,
        correlationId: formatCorrelationId('pr', repoInfo.fullName, `${prNumber}:${headSha}`),
      },
      event: {
        type: EventType.CodeReview,
        projectSlug,
      },
      content: {
        rawText: trimText(rawText, 'PR without description'),
        title: `[PR #${prNumber}] ${prTitle}`,
        sections: {
          summary: commentText,
        },
      },
      classification: {
        kind: KnowledgeKind.Summary,
        canonicalType: CanonicalType.Knowledge,
        importance: defaultImportance(KnowledgeKind.Summary),
        tags: ['code-review', 'pull-request', projectSlug],
      },
      metadata: {
        repoFullName: repoInfo.fullName,
        prNumber,
        prTitle,
        prUrl: String(pullRequest?.html_url || ''),
        baseBranch: String(pullRequest?.base?.ref || ''),
        headBranch: String(pullRequest?.head?.ref || ''),
        baseSha: String(pullRequest?.base?.sha || ''),
        headSha,
      },
      links: changedFiles.map((file) => file.filename),
    });
  }
}
