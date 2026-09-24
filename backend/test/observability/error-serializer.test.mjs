import test from 'node:test';
import assert from 'node:assert/strict';

import { serializeErrorForLog } from '../../dist/observability/error-serializer.js';

test('serializeErrorForLog serializes non-Error primitives to error string', () => {
  const result = serializeErrorForLog('some string error');
  assert.deepEqual(result, { error: 'some string error' });
});

test('serializeErrorForLog extracts standard Error fields', () => {
  const error = new Error('Database connection failed');
  const result = serializeErrorForLog(error);
  assert.equal(result.error, 'Database connection failed');
  assert.equal(result.errorName, 'Error');
  assert.ok(typeof result.errorStack === 'string');
});

test('serializeErrorForLog extracts nested cause and custom attributes', () => {
  const cause = new Error('Connection refused');
  const error = new Error('HTTP request failed', { cause });
  Object.assign(error, {
    status: 502,
    statusText: 'Bad Gateway',
    endpoint: '/api/v1/decide',
    provider: 'openai',
    model: 'gpt-4o',
    responseBody: '{"error":"bad_gateway"}',
  });

  const result = serializeErrorForLog(error);
  assert.equal(result.error, 'HTTP request failed');
  assert.equal(result.errorCause, 'Connection refused');
  assert.equal(result.errorStatus, 502);
  assert.equal(result.errorStatusText, 'Bad Gateway');
  assert.equal(result.errorEndpoint, '/api/v1/decide');
  assert.equal(result.errorProvider, 'openai');
  assert.equal(result.errorModel, 'gpt-4o');
  assert.equal(result.errorResponseBody, '{"error":"bad_gateway"}');
});
