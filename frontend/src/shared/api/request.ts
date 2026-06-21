import { ApiClientError, isApiErrorEnvelope } from './models/error';
import { resolveApiPath } from './api-path';

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
  return readJsonFromText(text);
}

function readJsonFromText(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
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
  let code = 'request_failed';
  let message = 'Request failed.';
  let details: Record<string, any> = {};
  let requestId = response.headers.get('x-request-id') || '';

  if (isApiErrorEnvelope(payload)) {
    code = payload.error.code;
    message = payload.error.message;
    details = payload.error.details;
    if (payload.requestId) requestId = payload.requestId;
  } else if (payload && typeof payload === 'object') {
    const raw = payload as any;
    if (typeof raw.code === 'string') {
      code = raw.code;
    } else if (typeof raw.error === 'string') {
      code = raw.error.toLowerCase().replace(/\s+/g, '_');
    }
    if (typeof raw.message === 'string') {
      message = raw.message;
    }
    const { statusCode, error, message: _, code: __, ...extra } = raw;
    details = extra;
  }

  const apiErr = new ApiClientError({ status: response.status, code, message, requestId, details });
  if (code === 'QUOTA_EXCEEDED' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('quota-exceeded', { detail: apiErr }));
  }
  return apiErr;
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

async function sendText(path: string, init: RequestInit = {}): Promise<{ response: Response; text: string }> {
  const response = await fetch(resolveApiPath(path), {
    ...buildInit({
      ...init,
      headers: { accept: 'text/plain, text/markdown, application/json, */*', ...(init.headers || {}) },
    }),
  });
  return { response, text: await response.text() };
}

async function executeTextRequest(path: string, init: RequestInit = {}, options: RequestOptions): Promise<string> {
  const { response, text } = await sendText(path, init);
  if (response.ok) return text;

  const payload = readJsonFromText(text);
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

  return executeTextRequest(path, init, { hasRetried: true });
}

export async function requestText(path: string, init: RequestInit = {}): Promise<string> {
  return executeTextRequest(path, init, { hasRetried: false });
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
  avatarUrl: string | null;
};
