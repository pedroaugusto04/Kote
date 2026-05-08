import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, fetchDashboard, getErrorMessage, runQuery } from '../../../src/shared/api/client';

afterEach(() => {
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
      message: 'Workspace ja existe.',
      requestId: 'req-409',
    });

    expect(getErrorMessage(error, 'Nao foi possivel concluir a operacao.')).toBe('Workspace ja existe.');
  });

  it('uses the fallback for unknown errors', () => {
    expect(getErrorMessage(new Error('boom'), 'Nao foi possivel concluir a operacao.')).toBe('Nao foi possivel concluir a operacao.');
    expect(getErrorMessage('boom', 'Nao foi possivel concluir a operacao.')).toBe('Nao foi possivel concluir a operacao.');
  });

  it('clamps query limit to the backend maximum', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      ok: true,
      matches: [],
      pagination: { page: 1, pageSize: 5, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await runQuery({ query: 'Nota1', workspaceSlug: 'workspace1', limit: 50, page: 1, pageSize: 5 });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/query?query=Nota1&projectSlug=&workspaceSlug=workspace1&limit=10&page=1&pageSize=5'),
      expect.any(Object),
    );
  });
});
