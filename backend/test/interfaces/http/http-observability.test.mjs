import 'reflect-metadata';

import test from 'node:test';
import assert from 'node:assert/strict';

import { HttpException, HttpStatus } from '@nestjs/common';
import { EventEmitter } from 'node:events';

import { queryRequestSchema } from '../../../dist/interfaces/http/dto/query.dto.js';
import { ZodValidationPipe } from '../../../dist/interfaces/http/zod-validation.pipe.js';
import { GlobalExceptionFilter } from '../../../dist/observability/global-exception.filter.js';
import { redactSensitiveValue } from '../../../dist/observability/redact.js';
import { runWithRequestContext } from '../../../dist/observability/request-context.js';
import { requestLifecycleMiddleware } from '../../../dist/observability/request-lifecycle.middleware.js';

function loggerMock() {
  const calls = [];
  const push = (level) => (_event, fields) => {
    calls.push({ level, fields });
  };
  return {
    calls,
    debug: push('debug'),
    info: push('info'),
    warn: push('warn'),
    error: push('error'),
  };
}

function responseMock() {
  const headers = new Map();
  return {
    headersSent: false,
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
  };
}

function eventedResponseMock() {
  const emitter = new EventEmitter();
  return {
    ...responseMock(),
    on(event, listener) {
      emitter.on(event, listener);
      return this;
    },
    emit(event) {
      emitter.emit(event);
      return this;
    },
  };
}

function requestMock(overrides = {}) {
  return {
    headers: {},
    method: 'GET',
    originalUrl: '/api/test',
    path: '/api/test',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    query: {},
    body: {},
    params: {},
    ...overrides,
  };
}

function hostMock(request, response) {
  return {
    switchToHttp() {
      return {
        getRequest: () => request,
        getResponse: () => response,
      };
    },
  };
}

test('global exception filter returns catalog envelope for HttpException', () => {
  const logger = loggerMock();
  const filter = new GlobalExceptionFilter(logger);
  const request = requestMock({ headers: { 'x-request-id': 'req-http' } });
  const response = responseMock();

  runWithRequestContext({
    requestId: 'req-http',
    startTime: Date.now() - 10,
    method: 'GET',
    path: '/api/test',
    ip: '127.0.0.1',
  }, () => {
    filter.catch(new HttpException('invalid_origin', HttpStatus.FORBIDDEN), hostMock(request, response));
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, {
    ok: false,
    error: {
      code: 'invalid_origin',
      message: 'Origin not allowed.',
      details: {},
    },
    requestId: 'req-http',
  });
  assert.equal(logger.calls.at(-1).level, 'warn');
});

test('global exception filter preserves known project deletion error code', () => {
  const logger = loggerMock();
  const filter = new GlobalExceptionFilter(logger);
  const request = requestMock({ headers: { 'x-request-id': 'req-project-delete' } });
  const response = responseMock();

  runWithRequestContext({
    requestId: 'req-project-delete',
    startTime: Date.now() - 10,
    method: 'DELETE',
    path: '/api/projects/platform',
    ip: '127.0.0.1',
  }, () => {
    filter.catch(new HttpException('project_has_notes', HttpStatus.BAD_REQUEST), hostMock(request, response));
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    ok: false,
    error: {
      code: 'project_has_notes',
      message: 'Delete or move the project notes before removing it.',
      details: {},
    },
    requestId: 'req-project-delete',
  });
  assert.equal(logger.calls.at(-1).level, 'info');
});

test('global exception filter preserves validation details', () => {
  const logger = loggerMock();
  const filter = new GlobalExceptionFilter(logger);
  const request = requestMock({ headers: { 'x-request-id': 'req-validation' } });
  const response = responseMock();
  const pipe = new ZodValidationPipe(queryRequestSchema, 'invalid_query_payload');
  let error;
  try {
    pipe.transform({ limit: 'abc' });
  } catch (caught) {
    error = caught;
  }

  runWithRequestContext({
    requestId: 'req-validation',
    startTime: Date.now() - 10,
    method: 'GET',
    path: '/api/query',
    ip: '127.0.0.1',
  }, () => {
    filter.catch(error, hostMock(request, response));
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    ok: false,
    error: {
      code: 'invalid_query_payload',
      message: 'Invalid query payload.',
      details: {
        issues: [
          {
            code: 'invalid_type',
            message: 'Expected number, received nan',
            path: 'limit',
          },
        ],
        fieldErrors: {
          limit: 'Expected number, received nan',
        },
      },
    },
    requestId: 'req-validation',
  });
});

test('global exception filter exposes custom 4xx HttpException messages', () => {
  const logger = loggerMock();
  const filter = new GlobalExceptionFilter(logger);
  const request = requestMock({ headers: { 'x-request-id': 'req-billing' } });
  const response = responseMock();

  runWithRequestContext({
    requestId: 'req-billing',
    startTime: Date.now() - 10,
    method: 'POST',
    path: '/api/subscription',
    ip: '127.0.0.1',
  }, () => {
    filter.catch(
      new HttpException('There is already a pending charge awaiting payment', HttpStatus.BAD_REQUEST),
      hostMock(request, response),
    );
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, 'bad_request');
  assert.equal(response.body.error.message, 'There is already a pending charge awaiting payment');
});

test('global exception filter hides unexpected errors behind internal_server_error', () => {
  const logger = loggerMock();
  const filter = new GlobalExceptionFilter(logger);
  const request = requestMock({ headers: { 'x-request-id': 'req-unexpected' } });
  const response = responseMock();

  runWithRequestContext({
    requestId: 'req-unexpected',
    startTime: Date.now() - 10,
    method: 'GET',
    path: '/api/test',
    ip: '127.0.0.1',
  }, () => {
    filter.catch(new Error('kaboom'), hostMock(request, response));
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    ok: false,
    error: {
      code: 'internal_server_error',
      message: 'Internal server error.',
      details: {},
    },
    requestId: 'req-unexpected',
  });
  assert.equal(logger.calls.at(-1).level, 'error');
});

test('global exception filter maps typed domain AppExceptions using exhaustive catalog', async () => {
  const {
    NoteNotFoundException,
    QuotaExceededException,
    BillingRuleException,
    AiNotConfiguredException,
    AppErrorCode,
  } = await import('../../../dist/domain/exceptions/index.js');

  const logger = loggerMock();
  const filter = new GlobalExceptionFilter(logger);

  const cases = [
    {
      error: new NoteNotFoundException(),
      statusCode: 404,
      code: 'note_not_found',
      message: 'Note not found.',
      details: {},
    },
    {
      error: new QuotaExceededException('storage', 100, 105),
      statusCode: 403,
      code: 'quota_exceeded',
      message: 'You have reached the limit of 100 for storage. Current usage: 105.',
      details: { resourceType: 'storage', limit: 100, current: 105 },
    },
    {
      error: new BillingRuleException('A plan change is already scheduled.'),
      statusCode: 400,
      code: 'bad_request',
      message: 'A plan change is already scheduled.',
      details: {},
    },
    {
      error: new AiNotConfiguredException(AppErrorCode.ReviewAiNotConfigured, ['KB_REVIEW_AI_API_KEY']),
      statusCode: 400,
      code: 'review_ai_not_configured',
      message: 'Review AI is not configured.',
      details: { missing: ['KB_REVIEW_AI_API_KEY'] },
    },
  ];

  for (const item of cases) {
    const request = requestMock({ headers: { 'x-request-id': `req-${item.code}` } });
    const response = responseMock();
    runWithRequestContext({
      requestId: `req-${item.code}`,
      startTime: Date.now() - 5,
      method: 'POST',
      path: '/api/test',
      ip: '127.0.0.1',
    }, () => {
      filter.catch(item.error, hostMock(request, response));
    });
    assert.equal(response.statusCode, item.statusCode);
    assert.deepEqual(response.body, {
      ok: false,
      error: {
        code: item.code,
        message: item.message,
        details: item.details,
      },
      requestId: `req-${item.code}`,
    });
  }
});

test('logger redaction removes nested secrets recursively', () => {
  assert.deepEqual(redactSensitiveValue({
    authorization: 'Bearer secret',
    nested: {
      token: 'abc',
      apiKey: '123',
      safe: 'visible',
    },
    headers: {
      'x-hub-signature-256': 'sha',
      normal: 'ok',
    },
  }), {
    authorization: '[redacted]',
    nested: {
      token: '[redacted]',
      apiKey: '[redacted]',
      safe: 'visible',
    },
    headers: {
      'x-hub-signature-256': '[redacted]',
      normal: 'ok',
    },
  });
});

test('request ids are propagated by the lifecycle middleware and reused by the error envelope', () => {
  const logger = loggerMock();
  const middleware = requestLifecycleMiddleware(logger);
  const filter = new GlobalExceptionFilter(logger);
  const request = requestMock({
    method: 'POST',
    originalUrl: '/api/auth/logout',
    path: '/api/auth/logout',
    headers: { origin: 'https://evil.example.com', 'x-request-id': 'req-denied' },
  });
  const response = eventedResponseMock();

  middleware(request, response, () => {
    filter.catch(new HttpException('invalid_origin', HttpStatus.FORBIDDEN), hostMock(request, response));
    response.emit('finish');
  });

  assert.equal(response.getHeader('x-request-id'), 'req-denied');
  assert.deepEqual(response.body, {
    ok: false,
    error: {
      code: 'invalid_origin',
      message: 'Origin not allowed.',
      details: {},
    },
    requestId: 'req-denied',
  });

  const generatedResponse = eventedResponseMock();
  middleware(requestMock({ originalUrl: '/api/health', path: '/api/health' }), generatedResponse, () => {
    generatedResponse.emit('finish');
  });
  assert.ok(generatedResponse.getHeader('x-request-id'));
});

test('request lifecycle middleware skips noisy health-check request logs', () => {
  const logger = loggerMock();
  const middleware = requestLifecycleMiddleware(logger);
  const response = eventedResponseMock();

  middleware(requestMock({ originalUrl: '/api/health', path: '/api/health' }), response, () => {
    response.emit('finish');
  });

  assert.deepEqual(logger.calls, []);
});
