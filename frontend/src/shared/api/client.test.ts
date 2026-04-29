import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, fetchDashboard } from './client';

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
});
