import { ApiClientError, isApiErrorEnvelope } from './models/error';

const apiBasePath = (import.meta.env.VITE_KB_API_BASE_PATH || '').replace(/\/$/, '');

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function resolveApiPath(path: string) {
  if (!apiBasePath || !path.startsWith('/api')) return path;
  return `${apiBasePath}${path.slice('/api'.length) || '/'}`;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(resolveApiPath(path), {
    ...init,
    credentials: 'include',
    headers: { accept: 'application/json', ...(init.headers || {}) },
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const requestId = response.headers.get('x-request-id') || (isApiErrorEnvelope(payload) ? payload.requestId : '');
    const code = isApiErrorEnvelope(payload) ? payload.error.code : 'request_failed';
    const message = isApiErrorEnvelope(payload) ? payload.error.message : 'Request failed.';
    const details = isApiErrorEnvelope(payload) ? payload.error.details : {};
    throw new ApiClientError({ status: response.status, code, message, requestId, details });
  }
  return payload as T;
}

export { ApiClientError };

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};
