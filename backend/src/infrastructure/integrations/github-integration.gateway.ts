import { Injectable } from '@nestjs/common';

import {
  fetchComparePayload,
  fetchGithubInstallationRepositories,
  fetchGithubInstallationToken,
  verifyGithubSignature,
  postGithubPullRequestComment,
} from '../../adapters/github.js';
import {
  GithubIntegrationGateway,
  type GithubComparePayload,
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
}
