import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, fetchAskHistory, fetchCurrentUser, fetchDashboard, getErrorMessage, runQuery } from '../../../src/shared/api/client';
import { resolveApiPath } from '../../../src/shared/api/api-path';
import { request, resetRequestStateForTests } from '../../../src/shared/api/request';

function apiErrorResponse(status: number, code: string, message = 'Request failed.', requestId = `req-${code}`, details: Record<string, unknown> = {}) {
  return Response.json({
    ok: false,
    error: { code, message, details },
    requestId,
  }, {
    status,
    headers: { 'x-request-id': requestId },
  });
}

afterEach(() => {
  resetRequestStateForTests();
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('parses the backend error envelope into ApiClientError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ok: false,
      error: {
        code: 'invalid_query_payload',
        message: 'Payload de consulta invalido.',
        details: { issues: [{ path: 'query', code: 'invalid_type' }] },
      },
      requestId: 'req-123',
    }, {
      status: 400,
      headers: { 'x-request-id': 'req-123' },
    })));

    await expect(fetchDashboard()).rejects.toEqual(expect.objectContaining({
      name: 'ApiClientError',
      status: 400,
      code: 'invalid_query_payload',
      message: 'Payload de consulta invalido.',
      requestId: 'req-123',
      details: { issues: [{ path: 'query', code: 'invalid_type' }] },
    }));
  });

  it('falls back to a generic ApiClientError when the API returns no envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, {
      status: 503,
      headers: { 'x-request-id': 'req-503' },
    })));

    const error = await fetchDashboard().catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toEqual(expect.objectContaining({
      status: 503,
      code: 'request_failed',
      message: 'Request failed.',
      requestId: 'req-503',
    }));
  });

  it('prefers the backend message for ApiClientError instances', () => {
    const error = new ApiClientError({
      status: 409,
      code: 'workspace_exists',
      message: 'Workspace already exists.',
      requestId: 'req-409',
    });

    expect(getErrorMessage(error, 'Could not complete the operation.')).toBe('Workspace already exists.');
  });

  it('uses the fallback for unknown errors', () => {
    expect(getErrorMessage(new Error('boom'), 'Could not complete the operation.')).toBe('Could not complete the operation.');
    expect(getErrorMessage('boom', 'Could not complete the operation.')).toBe('Could not complete the operation.');
  });

  it('clamps query limit to the backend maximum', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      ok: true,
      matches: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await runQuery({ query: 'Nota1', workspaceSlug: 'workspace1', status: 'resolved', limit: 50, page: 1, pageSize: 10 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/query?query=Nota1&projectSlug=&workspaceSlug=workspace1&status=resolved&limit=10&page=1&pageSize=10'),
      expect.any(Object),
    );
  });

  it('fetches Ask AI history with pagination and project filters', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      ok: true,
      history: [],
      pagination: { page: 2, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: true },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchAskHistory({ page: 2, pageSize: 10, projectSlug: 'platform' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/ask/history?page=2&pageSize=10&projectSlug=platform'),
      expect.any(Object),
    );
  });

  it('returns successful responses without attempting refresh', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true, projects: [], workspaces: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDashboard()).resolves.toEqual({ ok: true, projects: [], workspaces: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard', expect.objectContaining({
      credentials: 'include',
      headers: { accept: 'application/json' },
    }));
  });

  it('fetches the current authenticated user from /api/auth/me', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      ok: true,
      user: { id: 'user-1', email: 'ada@example.com', displayName: 'Ada Lovelace', role: 'owner', avatarUrl: null },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCurrentUser()).resolves.toEqual({
      ok: true,
      user: { id: 'user-1', email: 'ada@example.com', displayName: 'Ada Lovelace', role: 'owner', avatarUrl: null },
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({
      credentials: 'include',
      headers: { accept: 'application/json' },
    }));
  });

  it('resolves API asset paths under the configured API base path', () => {
    expect(resolveApiPath('/api/auth/avatar/content?v=1', '/knowledge-base/api')).toBe('/knowledge-base/api/auth/avatar/content?v=1');
    expect(resolveApiPath('https://cdn.example.com/avatar.png', '/knowledge-base/api')).toBe('https://cdn.example.com/avatar.png');
  });

  it('refreshes once after a session 401 and retries the original request', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard' && fetchMock.mock.calls.filter(([call]) => String(call) === '/api/dashboard').length === 1) {
        return apiErrorResponse(401, 'token_expired', 'Sessao expirada.', 'req-expired');
      }
      if (url === '/api/auth/refresh') {
        return Response.json({ ok: true });
      }
      if (url === '/api/dashboard') {
        return Response.json({ ok: true, projects: [], workspaces: [] });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDashboard()).resolves.toEqual({ ok: true, projects: [], workspaces: [] });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/dashboard',
      '/api/auth/refresh',
      '/api/dashboard',
    ]);
  });

  it('deduplicates concurrent refresh attempts across requests', async () => {
    const refreshBarrier = Promise.withResolvers<void>();
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard' || url.startsWith('/api/query?')) {
        const callCount = fetchMock.mock.calls.filter(([call]) => {
          const value = String(call);
          return value === url;
        }).length;
        if (callCount === 1) {
          return apiErrorResponse(401, 'token_expired', 'Sessao expirada.');
        }
        if (url === '/api/dashboard') {
          return Response.json({ ok: true, projects: [], workspaces: [] });
        }
        return Response.json({
          ok: true,
          matches: [],
          pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
        });
      }
      if (url === '/api/auth/refresh') {
        refreshCalls += 1;
        await refreshBarrier.promise;
        return Response.json({ ok: true });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const dashboardPromise = fetchDashboard();
    const queryPromise = runQuery({ query: 'Nota1', workspaceSlug: 'workspace1' });
    refreshBarrier.resolve();

    await expect(Promise.all([dashboardPromise, queryPromise])).resolves.toEqual([
      { ok: true, projects: [], workspaces: [] },
      {
        ok: true,
        matches: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
      },
    ]);
    expect(refreshCalls).toBe(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/auth/refresh')).toHaveLength(1);
  });

  it('does not attempt refresh for non-session 401 errors', async () => {
    const fetchMock = vi.fn(async (input?: any) => apiErrorResponse(401, 'invalid_credentials', 'Credenciais invalidas.'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDashboard()).rejects.toEqual(expect.objectContaining({
      status: 401,
      code: 'invalid_credentials',
    }));
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(['/api/dashboard']);
  });

  it('logs out best-effort when refresh fails with 401 and rethrows the auth error', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return apiErrorResponse(401, 'token_expired', 'Sessao expirada.', 'req-expired');
      }
      if (url === '/api/auth/refresh') {
        return apiErrorResponse(401, 'invalid_refresh_token', 'Refresh expirado.', 'req-refresh');
      }
      if (url === '/api/auth/logout') {
        return Response.json({ ok: true });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDashboard()).rejects.toEqual(expect.objectContaining({
      status: 401,
      code: 'invalid_refresh_token',
      requestId: 'req-refresh',
    }));
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/dashboard',
      '/api/auth/refresh',
      '/api/auth/logout',
    ]);
  });

  it('preserves refresh 5xx errors instead of forcing logout', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return apiErrorResponse(401, 'token_expired', 'Sessao expirada.');
      }
      if (url === '/api/auth/refresh') {
        return apiErrorResponse(503, 'refresh_unavailable', 'Refresh indisponivel.', 'req-refresh-503');
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDashboard()).rejects.toEqual(expect.objectContaining({
      status: 503,
      code: 'refresh_unavailable',
      requestId: 'req-refresh-503',
    }));
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/dashboard',
      '/api/auth/refresh',
    ]);
  });

  it('preserves refresh network errors instead of forcing logout', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return apiErrorResponse(401, 'token_expired', 'Sessao expirada.');
      }
      if (url === '/api/auth/refresh') {
        throw new TypeError('Failed to fetch');
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDashboard()).rejects.toEqual(expect.objectContaining({
      name: 'TypeError',
      message: 'Failed to fetch',
    }));
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/dashboard',
      '/api/auth/refresh',
    ]);
  });

  it('does not try to refresh the refresh endpoint itself', async () => {
    const fetchMock = vi.fn(async (input?: any) => apiErrorResponse(401, 'token_expired', 'Sessao expirada.', 'req-refresh'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(request('/api/auth/refresh', { method: 'POST' })).rejects.toEqual(expect.objectContaining({
      status: 401,
      code: 'token_expired',
      requestId: 'req-refresh',
    }));
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(['/api/auth/refresh']);
  });

  it('retries each original request at most once', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return apiErrorResponse(401, 'token_expired', 'Sessao expirada.', 'req-expired');
      }
      if (url === '/api/auth/refresh') {
        return Response.json({ ok: true });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDashboard()).rejects.toEqual(expect.objectContaining({
      status: 401,
      code: 'token_expired',
      requestId: 'req-expired',
    }));
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/dashboard',
      '/api/auth/refresh',
      '/api/dashboard',
    ]);
  });
});
