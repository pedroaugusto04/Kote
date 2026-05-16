import { ApiClientError, isApiErrorEnvelope } from './models/error';

const apiBasePath = (import.meta.env.VITE_KB_API_BASE_PATH || '').replace(/\/$/, '');
const sessionErrorCodes = new Set([
  'missing_access_token',
  'token_expired',
  'invalid_token',
  'invalid_token_type',
]);
const authRetryExcludedPaths = new Set([
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/logout',
  '/api/auth/refresh',
]);

type RawResponse = {
  response: Response;
  payload: unknown;
};

type RequestOptions = {
  hasRetried: boolean;
};

let refreshPromise: Promise<void> | null = null;

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

function buildInit(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    credentials: 'include',
    headers: { accept: 'application/json', ...(init.headers || {}) },
  };
}

async function send(path: string, init: RequestInit = {}): Promise<RawResponse> {
  const response = await fetch(resolveApiPath(path), {
    ...buildInit(init),
  });
  return { response, payload: await readJson(response) };
}

function toApiClientError(response: Response, payload: unknown) {
  const requestId = response.headers.get('x-request-id') || (isApiErrorEnvelope(payload) ? payload.requestId : '');
  const code = isApiErrorEnvelope(payload) ? payload.error.code : 'request_failed';
  const message = isApiErrorEnvelope(payload) ? payload.error.message : 'Request failed.';
  const details = isApiErrorEnvelope(payload) ? payload.error.details : {};
  return new ApiClientError({ status: response.status, code, message, requestId, details });
}

function shouldAttemptRefresh(path: string, response: Response, payload: unknown, options: RequestOptions) {
  if (options.hasRetried) return false;
  if (response.status !== 401) return false;
  if (authRetryExcludedPaths.has(path)) return false;
  if (!isApiErrorEnvelope(payload)) return false;
  return sessionErrorCodes.has(payload.error.code);
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const { response, payload } = await send('/api/auth/refresh', { method: 'POST' });
      if (!response.ok) {
        throw toApiClientError(response, payload);
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

async function logoutSilently() {
  try {
    await send('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore network failures while clearing HttpOnly cookies best-effort.
  }
}

async function executeRequest<T>(path: string, init: RequestInit = {}, options: RequestOptions): Promise<T> {
  const { response, payload } = await send(path, init);
  if (response.ok) {
    return payload as T;
  }

  if (!shouldAttemptRefresh(path, response, payload, options)) {
    throw toApiClientError(response, payload);
  }

  try {
    await refreshSession();
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      await logoutSilently();
    }
    throw error;
  }

  return executeRequest<T>(path, init, { hasRetried: true });
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return executeRequest<T>(path, init, { hasRetried: false });
}

export function resetRequestStateForTests() {
  refreshPromise = null;
}

export { ApiClientError };

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};
