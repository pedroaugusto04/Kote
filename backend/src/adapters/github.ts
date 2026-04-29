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
  if (!signature || !timingSafeEqualString(signature, expected)) {
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
          message: trimText(String(commit.commit?.message || ''), 'sem mensagem'),
        }))
      : [],
  };
}

export type GithubInstallationRepository = {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  htmlUrl: string;
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
      full_name?: string;
      name?: string;
      private?: boolean;
      html_url?: string;
      owner?: { login?: string };
    }>;
  };
  return (data.repositories || [])
    .map((repo) => ({
      fullName: String(repo.full_name || '').trim(),
      name: String(repo.name || '').trim(),
      owner: String(repo.owner?.login || '').trim(),
      private: Boolean(repo.private),
      htmlUrl: String(repo.html_url || '').trim(),
    }))
    .filter((repo) => repo.fullName);
}
