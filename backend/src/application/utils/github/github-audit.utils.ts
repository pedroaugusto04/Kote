export type GithubPushPayload = {
  ref?: string;
  before?: string;
  after?: string;
  deleted?: boolean;
  installation?: { id?: string | number };
  repository?: {
    id?: string | number;
    full_name?: string;
    name?: string;
    private?: boolean;
  };
  pusher?: { name?: string };
  sender?: { login?: string };
  head_commit?: {
    id?: string;
    message?: string;
    timestamp?: string;
    url?: string;
  };
  commits?: Array<{ id?: string; message?: string; added?: string[]; modified?: string[]; removed?: string[] }>;
};

export type GithubPullRequestPayload = {
  action?: string;
  number?: number;
  pull_request?: {
    number?: number;
    title?: string;
    body?: string;
    base?: { sha?: string };
    head?: { sha?: string };
  };
  installation?: { id?: string | number };
  repository?: {
    id?: string | number;
    full_name?: string;
    private?: boolean;
  };
  sender?: { login?: string };
};

export function githubAuditPayload(body: GithubPushPayload): Record<string, unknown> {
  return {
    installationId: body.installation?.id == null ? '' : String(body.installation.id),
    repositoryId: body.repository?.id == null ? '' : String(body.repository.id),
    repositoryFullName: String(body.repository?.full_name || '').trim(),
    repositoryPrivate: body.repository?.private === true,
    ref: String(body.ref || ''),
    before: String(body.before || ''),
    after: String(body.after || ''),
    deleted: body.deleted === true,
    pusherName: String(body.pusher?.name || ''),
    senderLogin: String(body.sender?.login || ''),
  };
}

export function githubPrAuditPayload(body: GithubPullRequestPayload): Record<string, unknown> {
  return {
    action: String(body.action || ''),
    prNumber: body.pull_request?.number == null ? 0 : Number(body.pull_request.number),
    installationId: body.installation?.id == null ? '' : String(body.installation.id),
    repositoryId: body.repository?.id == null ? '' : String(body.repository.id),
    repositoryFullName: String(body.repository?.full_name || '').trim(),
    repositoryPrivate: body.repository?.private === true,
    baseSha: String(body.pull_request?.base?.sha || ''),
    headSha: String(body.pull_request?.head?.sha || ''),
    senderLogin: String(body.sender?.login || ''),
  };
}
