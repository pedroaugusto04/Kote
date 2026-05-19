import crypto from 'node:crypto';

import { BadRequestException } from '@nestjs/common';

import type { IntegrationConnectionSessionRecord } from '../models/repository-records.models.js';

export const CONNECTION_TTL_MS = 10 * 60 * 1000;
export const PENDING_STATUS = 'pending';
export const CONNECTED_STATUS = 'connected';

export type ConnectionSessionMetadata = {
  browserOrigin?: string;
  returnToPath?: string;
  connectedAccount?: string;
  lastError?: string;
  installationId?: string;
};

export type ConnectionSessionView = {
  id: string;
  provider: string;
  status: string;
  workspaceSlug: string;
  expiresAt: string;
  consumedAt: string | null;
  connectedAccount?: string;
  lastError?: string;
};

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomState(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function randomVerificationCode(): string {
  return crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
}

export function expiresAt(): string {
  return new Date(Date.now() + CONNECTION_TTL_MS).toISOString();
}

export function isExpired(session: IntegrationConnectionSessionRecord): boolean {
  return session.expiresAt <= new Date().toISOString();
}

export function publicSession(session: IntegrationConnectionSessionRecord): ConnectionSessionView {
  const status = session.status === PENDING_STATUS && isExpired(session) ? 'expired' : session.status;
  const metadata = session.metadata as ConnectionSessionMetadata;
  return {
    id: session.id,
    provider: session.provider,
    status,
    workspaceSlug: session.workspaceSlug,
    expiresAt: session.expiresAt,
    consumedAt: session.consumedAt,
    connectedAccount: typeof metadata.connectedAccount === 'string' ? metadata.connectedAccount : undefined,
    lastError: typeof metadata.lastError === 'string' ? metadata.lastError : undefined,
  };
}

export function appendQuery(url: string, query: Record<string, string>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(query)) parsed.searchParams.set(key, value);
  return parsed.toString();
}

export function normalizeGithubAppInstallUrl(url: string): string {
  const parsed = new URL(url);
  const settingsAppMatch = parsed.pathname.match(/^\/settings\/apps\/([^/]+)\/?$/);
  if (parsed.origin === 'https://github.com' && settingsAppMatch) {
    parsed.pathname = `/apps/${settingsAppMatch[1]}/installations/new`;
    parsed.search = '';
    parsed.hash = '';
  }
  return parsed.toString();
}

export function extractGithubInstallationId(value: unknown): string {
  const installationId = String(value ?? '').trim();
  if (!installationId) throw new BadRequestException('github_callback_missing_installation');
  return installationId;
}

export function normalizeTrimmedValue(value: string): string {
  return value.trim();
}

export function normalizeReturnToPath(value: string | undefined, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  try {
    const parsed = new URL(value, 'https://knowledge-base.local');
    if (parsed.origin !== 'https://knowledge-base.local') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function normalizeBrowserOrigin(value: string | undefined): string {
  try {
    if (!value) return '';
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

export function buildBrowserRedirectUrl(baseUrl: string | undefined, path: string): URL {
  const normalizedPath = normalizeReturnToPath(path, '/settings/integrations');
  const fallbackBase = new URL('https://knowledge-base.local');
  const base = baseUrl ? new URL(baseUrl) : fallbackBase;
  const basePathname = base.pathname.replace(/\/+$/, '');
  const finalPath = normalizedPath === '/'
    ? (basePathname || '/')
    : basePathname && !normalizedPath.startsWith(`${basePathname}/`) && normalizedPath !== basePathname
      ? `${basePathname}${normalizedPath}`
      : normalizedPath;
  base.pathname = finalPath;
  base.search = '';
  base.hash = '';
  return base;
}

export function extractConnectionCommandCode(text: string): string {
  const match = text.trim().match(/^\/kb\s+(?:conectar|connect)\s+([a-z0-9-]{4,20})$/i);
  return match?.[1]?.trim().toUpperCase() || '';
}
