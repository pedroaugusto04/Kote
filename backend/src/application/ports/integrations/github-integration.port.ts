export type GithubComparePayload = {
  files: Array<{ filename: string; status: string; patch: string }>;
  commits: Array<{ sha: string; message: string }>;
};

export type GithubInstallationRepository = {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  htmlUrl: string;
  description: string | null;
  defaultBranch: string | null;
};

export abstract class GithubIntegrationGateway {
  abstract verifyWebhookSignature(secret: string, rawBody: string, signature: string): void;
  abstract fetchInstallationToken(input: { appId: string; privateKey: string; installationId: string }): Promise<string>;
  abstract fetchComparePayload(repoFullName: string, before: string, after: string, token: string): Promise<GithubComparePayload>;
  abstract fetchInstallationRepositories(input: {
    appId: string;
    privateKey: string;
    installationId: string;
  }): Promise<GithubInstallationRepository[]>;
  abstract postPullRequestComment(
    repoFullName: string,
    prNumber: number,
    bodyText: string,
    token: string,
  ): Promise<boolean>;
}
