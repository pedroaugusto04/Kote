import { Injectable } from '@nestjs/common';

import {
  fetchComparePayload,
  fetchCommitDiff,
  fetchGithubInstallationRepositories,
  fetchGithubInstallationToken,
  fetchRecentCommits,
  verifyGithubSignature,
  postGithubPullRequestComment,
  fetchGithubPullRequestComments,
} from '../../adapters/github.js';
import {
  GithubIntegrationGateway,
  type GithubComparePayload,
  type GithubCommitDiff,
  type GithubInstallationRepository,
} from '../../application/ports/integrations/github-integration.port.js';

@Injectable()
export class DefaultGithubIntegrationGateway extends GithubIntegrationGateway {
  verifyWebhookSignature(secret: string, rawBody: string, signature: string): void {
    verifyGithubSignature(secret, rawBody, signature);
  }

  fetchInstallationToken(input: { appId: string; privateKey: string; installationId: string }): Promise<string> {
    return fetchGithubInstallationToken(input);
  }

  fetchComparePayload(repoFullName: string, before: string, after: string, token: string): Promise<GithubComparePayload> {
    return fetchComparePayload(repoFullName, before, after, token);
  }

  fetchCommitDiff(repoFullName: string, sha: string, token: string): Promise<GithubCommitDiff> {
    return fetchCommitDiff(repoFullName, sha, token);
  }

  fetchRecentCommits(input: {
    repoFullName: string;
    branch: string;
    limit: number;
    token: string;
  }) {
    return fetchRecentCommits(input);
  }

  fetchInstallationRepositories(input: {
    appId: string;
    privateKey: string;
    installationId: string;
  }): Promise<GithubInstallationRepository[]> {
    return fetchGithubInstallationRepositories(input);
  }

  postPullRequestComment(
    repoFullName: string,
    prNumber: number,
    bodyText: string,
    token: string,
  ): Promise<boolean> {
    return postGithubPullRequestComment(repoFullName, prNumber, bodyText, token);
  }

  fetchPullRequestComments(
    repoFullName: string,
    prNumber: number,
    token: string,
  ): Promise<Array<{ id: number; body: string }>> {
    return fetchGithubPullRequestComments(repoFullName, prNumber, token);
  }
}
