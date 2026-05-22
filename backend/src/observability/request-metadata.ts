import type { Request } from 'express';

import { requestIp } from '../interfaces/http/request-ip.js';

type RequestWithUser = Request & {
  user?: {
    id?: string;
  };
};

function readRecordValue(record: unknown, key: string): unknown {
  if (!record || typeof record !== 'object') return undefined;
  return (record as Record<string, unknown>)[key];
}

function requestPath(request: Request): string {
  return request.originalUrl || request.url || request.path || '/';
}

function extractWorkspaceSlug(request: Request): string | undefined {
  const candidates = [
    readRecordValue(request.query, 'workspaceSlug'),
    readRecordValue(request.body, 'workspaceSlug'),
    readRecordValue(readRecordValue(request.body, 'payload'), 'workspaceSlug'),
    readRecordValue(request.params, 'workspaceSlug'),
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }
  return undefined;
}

function objectKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).sort();
}

export function getRequestMetadata(request: RequestWithUser) {
  return {
    method: request.method,
    path: requestPath(request),
    ip: requestIp(request),
    userId: request.user?.id,
    workspaceSlug: extractWorkspaceSlug(request),
  };
}

export function getSafeRequestLogDetails(request: Request) {
  return {
    contentType: String(request.headers['content-type'] || ''),
    contentLength: Number(request.headers['content-length'] || 0) || 0,
    queryKeys: objectKeys(request.query),
    bodyKeys: objectKeys(request.body),
  };
}
