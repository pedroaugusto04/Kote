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
