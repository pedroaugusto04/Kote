import { Injectable } from '@nestjs/common';

import type { PrReviewAgentDecision } from '../../../../contracts/pr-review-agent.js';
import type { GithubPullRequestWebhookRequest } from '../../../models/webhook-request.models.js';
import { GithubIntegrationGateway } from '../../../ports/integrations/github-integration.port.js';
import { buildGithubPrContextNoteEvent } from '../../../services/integrations/github-review.service.js';
import type { AgentSourceItem } from '../../../services/query/agent-context-tracker.js';
import { formatPrReviewComment } from '../../../services/review/pr-review-presenter.js';
import {
  isCommentForShaAlreadyPosted,
  formatPullRequestCommentWithSha,
  ingestPrReviewNote,
} from '../../../utils/github/github-review.helpers.js';
import { IngestEntryUseCase } from '../../ingest/ingest-entry.use-case.js';
import { AppLogger } from '../../../../observability/logger.js';

export interface GithubPrCommentCheckInput {
  repoFullName: string;
  prNumber: number;
  headSha: string;
  token: string;
}

export interface GithubPrCommentSyncInput {
  input: GithubPullRequestWebhookRequest;
  decision: PrReviewAgentDecision;
  trackedSources: AgentSourceItem[];
  changedFiles: Array<{ filename: string; status: string; patch: string }>;
  projectSlug: string;
  identity: { userId: string; workspaceSlug?: string | null };
  repoFullName: string;
  prNumber: number;
  headSha: string;
  token: string;
}

export interface GithubPrCommentSyncResult {
  commentPosted: boolean;
  finalComment: string;
  noteId?: string;
}

@Injectable()
export class GithubPrCommentSyncService {
  constructor(
    private readonly githubIntegrationGateway: GithubIntegrationGateway,
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly logger: AppLogger,
  ) {}

  async isCommentAlreadyPosted(params: GithubPrCommentCheckInput): Promise<boolean> {
    const existingComments = await this.githubIntegrationGateway.fetchPullRequestComments(
      params.repoFullName,
      params.prNumber,
      params.token,
    );

    if (isCommentForShaAlreadyPosted(existingComments, params.headSha)) {
      this.logger.info('github_pr_comment_already_exists_for_sha', {
        repository: params.repoFullName,
        prNumber: params.prNumber,
        headSha: params.headSha,
      });
      return true;
    }

    return false;
  }

  async publishReviewCommentAndSyncNote(
    params: GithubPrCommentSyncInput,
  ): Promise<GithubPrCommentSyncResult> {
    const formattedComment = formatPrReviewComment(
      params.decision,
      params.headSha,
      params.trackedSources,
    );
    const { comment: finalComment, isTruncated } = formatPullRequestCommentWithSha(
      formattedComment,
      params.headSha,
    );

    if (isTruncated) {
      this.logger.warn('github_pr_comment_exceeded_limit', {
        repository: params.repoFullName,
        prNumber: params.prNumber,
        originalLength: formattedComment.length + params.headSha.length,
      });
    }

    this.logger.info('github_pr_posting_comment', {
      repository: params.repoFullName,
      projectSlug: params.projectSlug,
      prNumber: params.prNumber,
      commentLength: finalComment.length,
    });

    const posted = await this.githubIntegrationGateway.postPullRequestComment(
      params.repoFullName,
      params.prNumber,
      finalComment,
      params.token,
    );

    this.logger.info('github_pr_comment_posted', {
      repository: params.repoFullName,
      projectSlug: params.projectSlug,
      prNumber: params.prNumber,
      posted,
    });

    const contextSummary = params.trackedSources.length > 0
      ? params.trackedSources.map((source) => `- ${source.title}: (${source.path})`).join('\n')
      : undefined;

    const noteId = await ingestPrReviewNote(
      {
        ingestEntryUseCase: this.ingestEntryUseCase,
        logger: this.logger,
      },
      {
        input: params.input,
        commentText: finalComment,
        changedFiles: params.changedFiles,
        contextSummary,
        projectSlug: params.projectSlug,
        identity: params.identity,
        repoFullName: params.repoFullName,
        prNumber: params.prNumber,
        buildPrContextNoteEvent: buildGithubPrContextNoteEvent,
      },
    );

    return {
      commentPosted: posted,
      finalComment,
      noteId,
    };
  }
}
