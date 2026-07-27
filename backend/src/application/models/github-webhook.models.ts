export type GithubPullRequestPayload = {
  action?: string;
  number?: number;
  pull_request?: {
    number?: number;
    title?: string;
    body?: string;
    base?: { sha?: string; ref?: string };
    head?: { sha?: string; ref?: string };
    html_url?: string;
  };
  installation?: {
    id?: string | number;
  };
  repository?: {
    id?: string | number;
    full_name?: string;
    name?: string;
    private?: boolean;
  };
  sender?: {
    login?: string;
  };
};

export type GithubPushPayload = {
  ref?: string;
  before?: string;
  after?: string;
  compare?: string;
  deleted?: boolean;
  repository?: {
    id?: string | number;
    full_name?: string;
    name?: string;
    html_url?: string;
    private?: boolean;
  };
  pusher?: {
    name?: string;
  };
  sender?: {
    login?: string;
  };
  head_commit?: {
    message?: string;
    timestamp?: string;
    url?: string;
  };
  commits?: Array<{
    id?: string;
    message?: string;
    added?: string[];
    modified?: string[];
    removed?: string[];
  }>;
  installation?: {
    id?: string | number;
  };
};

export type GithubRepositoryInfo = {
  fullName: string;
  name: string;
  private: boolean;
  id: string | number;
};

export type GithubCommitInfo = {
  sha: string;
  message: string;
  url?: string;
};

export type GithubPrInfo = {
  number: number;
  title: string;
  description: string;
  baseBranch: string;
  headBranch: string;
  baseSha: string;
  headSha: string;
  url: string;
};

export type ChangedFile = {
  filename: string;
  status: string;
  patch: string;
};
