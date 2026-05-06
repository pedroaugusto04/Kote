import { Injectable } from '@nestjs/common';

import {
  fetchComparePayload,
  fetchGithubInstallationRepositories,
  fetchGithubInstallationToken,
  verifyGithubSignature,
} from '../../adapters/github.js';
import {
  GithubIntegrationGateway,
  type GithubComparePayload,
  type GithubInstallationRepository,
} from '../../application/ports/github-integration.port.js';

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
}
