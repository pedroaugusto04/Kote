import test from 'node:test';
import assert from 'node:assert/strict';

import { BadRequestException } from '@nestjs/common';

import { queryRequestSchema } from '../dist/interfaces/http/dto/query.dto.js';
import { ZodValidationPipe } from '../dist/interfaces/http/zod-validation.pipe.js';

test('zod validation pipe parses successful payloads', () => {
  const pipe = new ZodValidationPipe(queryRequestSchema, 'invalid_query_payload');

  const parsed = pipe.transform({ query: 'deploy', limit: '3', mode: 'answer' });

  assert.deepEqual(parsed, {
    query: 'deploy',
    limit: 3,
    mode: 'answer',
    workspaceSlug: '',
    projectSlug: '',
  });
});

test('zod validation pipe returns normalized defaults', () => {
  const pipe = new ZodValidationPipe(queryRequestSchema, 'invalid_query_payload');

  const parsed = pipe.transform({ query: 'deploy' });

  assert.equal(parsed.limit, 5);
  assert.equal(parsed.mode, 'answer');
});

test('zod validation pipe throws bad request with stable code', () => {
  const pipe = new ZodValidationPipe(queryRequestSchema, 'invalid_query_payload');

  assert.throws(() => pipe.transform({ limit: 'abc' }), (error) => {
    assert.ok(error instanceof BadRequestException);
    assert.equal(error.message, 'invalid_query_payload');
    return true;
  });
});
