import { SourceChannel, EventType, KnowledgeKind, CanonicalType, KnowledgeStatus } from '../../contracts/enums.js';
import { formatCorrelationId } from '../utils/github/github-review.helpers.js';
import { defaultImportance } from '../../domain/classification.js';
import { trimText } from '../../domain/strings.js';
import { ingestPayloadSchema } from '../../contracts/ingest.js';

export interface GithubReviewMapperParams {
  actor: string;
  repoFullName: string;
  repoName: string;
  prNumber: number;
  headSha: string;
  prTitle: string;
  prBody: string;
  prUrl: string;
  baseBranch: string;
  headBranch: string;
  baseSha: string;
  projectSlug: string;
  rawText: string;
  analysis: {
    summary: string;
    impact: string;
    risks: string | string[];
    nextSteps: string | string[];
    reviewFindings: any[];
  };
  changedFiles: Array<{ filename: string }>;
  eventType?: 'pr' | 'push';
}

export class GithubReviewMapper {
  static toIngestPayload(params: GithubReviewMapperParams) {
    const correlationKey = params.eventType === 'push' ? params.headSha : `${params.prNumber}:${params.headSha}`;
    const correlationType = params.eventType === 'push' ? 'push' : 'pr';

    return ingestPayloadSchema.parse({
      source: {
        channel: SourceChannel.Github,
        system: 'github',
        source: params.eventType === 'push' ? 'github push' : 'github pull request',
        actor: params.actor,
        conversationId: params.repoFullName,
        correlationId: formatCorrelationId(correlationType, params.repoFullName, correlationKey),
      },
      event: {
        type: EventType.CodeReview,
        occurredAt: new Date().toISOString(),
        projectSlug: params.projectSlug,
      },
      content: {
        rawText: trimText(params.rawText, 'PR without description'),
        title: params.prNumber ? `[PR #${params.prNumber}] ${params.prTitle}` : `[Push] ${params.repoName}`,
        attachments: [],
        sections: {
          summary: params.analysis.summary,
          impact: params.analysis.impact,
          risks: params.analysis.risks,
          nextSteps: params.analysis.nextSteps,
          reviewFindings: params.analysis.reviewFindings,
        },
      },
      classification: {
        kind: KnowledgeKind.Summary,
        canonicalType: CanonicalType.Knowledge,
        importance: defaultImportance(KnowledgeKind.Summary),
        status: KnowledgeStatus.Active,
        tags: ['code-review', params.eventType === 'push' ? 'push' : 'pull-request', params.projectSlug],
        decisionFlag: false,
      },
      actions: {
        reminderDate: '',
        reminderTime: '',
        followUpBy: '',
      },
      metadata: {
        repoFullName: params.repoFullName,
        prNumber: params.prNumber,
        prTitle: params.prTitle,
        prUrl: params.prUrl,
        baseBranch: params.baseBranch,
        headBranch: params.headBranch,
        baseSha: params.baseSha,
        headSha: params.headSha,
      },
      links: params.changedFiles.map(f => f.filename),
    });
  }
}
