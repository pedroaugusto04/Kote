import crypto from 'node:crypto';

import { trimText } from '../domain/strings.js';

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyGithubSignature(secret: string, rawBody: string, signature: string): void {
  if (!secret) return;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const normalizedSignature = signature.trim();
  if (!normalizedSignature || !timingSafeEqualString(normalizedSignature, expected)) {
    throw new Error('invalid_github_signature');
  }
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function githubAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlJson({ iat: now - 60, exp: now + 9 * 60, iss: appId });
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const body = `${header}.${payload}`;
  const key = privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey;
  const signature = crypto.createSign('RSA-SHA256').update(body).sign(key, 'base64url');
  return `${body}.${signature}`;
}

export async function fetchGithubInstallationToken(input: { appId: string; privateKey: string; installationId: string }): Promise<string> {
  if (!input.appId || !input.privateKey || !input.installationId) return '';
  const response = await fetch(`https://api.github.com/app/installations/${encodeURIComponent(input.installationId)}/access_tokens`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${githubAppJwt(input.appId, input.privateKey)}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) return '';
  const payload = await response.json() as { token?: string };
  return String(payload.token || '');
}

export async function fetchComparePayload(repoFullName: string, before: string, after: string, token: string): Promise<{
  files: Array<{ filename: string; status: string; patch: string }>;
  commits: Array<{ sha: string; message: string }>;
}> {
  if (!repoFullName || !before || !after || !token) {
    return { files: [], commits: [] };
  }
  const response = await fetch(`https://api.github.com/repos/${repoFullName}/compare/${before}...${after}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) {
    return { files: [], commits: [] };
  }
  const data = (await response.json()) as {
    files?: Array<{ filename?: string; status?: string; patch?: string }>;
    commits?: Array<{ sha?: string; commit?: { message?: string } }>;
  };
  return {
    files: Array.isArray(data.files)
      ? data.files.map((file) => ({
          filename: String(file.filename || ''),
          status: String(file.status || ''),
          patch: String(file.patch || ''),
        }))
      : [],
    commits: Array.isArray(data.commits)
      ? data.commits.map((commit) => ({
          sha: String(commit.sha || ''),
          message: trimText(String(commit.commit?.message || ''), 'no message'),
        }))
      : [],
  };
}

export async function fetchCommitDiff(repoFullName: string, sha: string, token: string): Promise<{
  files: Array<{ filename: string; status: string; patch: string }>;
}> {
  if (!repoFullName || !sha || !token) {
    return { files: [] };
  }
  const response = await fetch(`https://api.github.com/repos/${repoFullName}/commits/${sha}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) {
    return { files: [] };
  }
  const data = (await response.json()) as {
    files?: Array<{ filename?: string; status?: string; patch?: string }>;
  };
  return {
    files: Array.isArray(data.files)
      ? data.files.map((file) => ({
          filename: String(file.filename || ''),
          status: String(file.status || ''),
          patch: String(file.patch || ''),
        }))
      : [],
  };
}

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

export async function fetchGithubInstallationRepositories(input: {
  appId: string;
  privateKey: string;
  installationId: string;
}): Promise<GithubInstallationRepository[]> {
  const token = await fetchGithubInstallationToken(input);
  if (!token) return [];
  const response = await fetch('https://api.github.com/installation/repositories?per_page=100', {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as {
    repositories?: Array<{
      id?: number;
      full_name?: string;
      name?: string;
      private?: boolean;
      html_url?: string;
      description?: string | null;
      default_branch?: string | null;
      owner?: { login?: string };
    }>;
  };
  return (data.repositories || [])
    .map((repo) => ({
      id: Number(repo.id || 0),
      fullName: String(repo.full_name || '').trim(),
      name: String(repo.name || '').trim(),
      owner: String(repo.owner?.login || '').trim(),
      private: Boolean(repo.private),
      htmlUrl: String(repo.html_url || '').trim(),
      description: repo.description == null ? null : String(repo.description),
      defaultBranch: repo.default_branch == null ? null : String(repo.default_branch),
    }))
    .filter((repo) => repo.fullName);
}

export type GithubRecentCommit = {
  sha: string;
  message: string;
  timestamp: string;
  url: string;
  parentSha: string;
};

export async function fetchRecentCommits(input: {
  repoFullName: string;
  branch: string;
  limit: number;
  token: string;
}): Promise<GithubRecentCommit[]> {
  const { repoFullName, branch, limit, token } = input;
  if (!repoFullName || !token || limit < 1) return [];
  const params = new URLSearchParams({
    sha: branch || 'main',
    per_page: String(Math.min(limit, 100)),
  });
  const response = await fetch(`https://api.github.com/repos/${repoFullName}/commits?${params.toString()}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as Array<{
    sha?: string;
    html_url?: string;
    commit?: { message?: string; author?: { date?: string } };
    parents?: Array<{ sha?: string }>;
  }>;
  if (!Array.isArray(data)) return [];
  return data
    .map((commit) => ({
      sha: String(commit.sha || '').trim(),
      message: trimText(String(commit.commit?.message || ''), 'no message'),
      timestamp: String(commit.commit?.author?.date || new Date().toISOString()),
      url: String(commit.html_url || '').trim(),
      parentSha: String(commit.parents?.[0]?.sha || '').trim(),
    }))
    .filter((commit) => commit.sha && commit.parentSha && isValidCommitSha(commit.sha));
}

function isValidCommitSha(sha: string): boolean {
  return !/^0+$/.test(String(sha || ''));
}

export async function postGithubPullRequestComment(
  repoFullName: string,
  prNumber: number,
  bodyText: string,
  token: string,
): Promise<boolean> {
  if (!repoFullName || !prNumber || !bodyText || !token) return false;
  const response = await fetch(`https://api.github.com/repos/${repoFullName}/issues/${prNumber}/comments`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ body: bodyText }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error('postGithubPullRequestComment failed', {
      repoFullName,
      prNumber,
      status: response.status,
      statusText: response.statusText,
      errorBody: errorText,
      bodyLength: bodyText.length,
    });
  }
  return response.ok;
}

export async function fetchGithubPullRequestComments(
  repoFullName: string,
  prNumber: number,
  token: string,
): Promise<Array<{ id: number; body: string }>> {
  if (!repoFullName || !prNumber || !token) return [];
  const response = await fetch(`https://api.github.com/repos/${repoFullName}/issues/${prNumber}/comments?per_page=100`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as Array<{ id?: number; body?: string }>;
  return data.map((comment) => ({
    id: Number(comment.id || 0),
    body: String(comment.body || ''),
  }));
}

