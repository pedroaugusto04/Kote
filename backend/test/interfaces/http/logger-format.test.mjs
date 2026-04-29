import 'reflect-metadata';

import test from 'node:test';
import assert from 'node:assert/strict';

import { AppLogger } from '../../../dist/observability/logger.js';
import { runWithRequestContext } from '../../../dist/observability/request-context.js';

const ANSI_PATTERN = /\u001B\[[0-9;]*m/g;

function withPatchedConsole(methodName, callback) {
  const originalMethod = console[methodName];
  const lines = [];
  console[methodName] = (line) => {
    lines.push(String(line));
  };
  try {
    callback(lines);
  } finally {
    console[methodName] = originalMethod;
  }
}

test('logger emits colorized pretty output when KB_LOG_PRETTY_CONSOLE is enabled', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousPretty = process.env.KB_LOG_PRETTY_CONSOLE;
  process.env.NODE_ENV = 'production';
  process.env.KB_LOG_PRETTY_CONSOLE = 'true';

  try {
    withPatchedConsole('log', (lines) => {
      runWithRequestContext({
        requestId: 'req-pretty',
        startTime: Date.now(),
        method: 'POST',
        path: '/api/query',
        ip: '127.0.0.1',
        statusCode: 201,
      }, () => {
        new AppLogger().info('http.request.completed', { durationMs: 12 });
      });

      assert.equal(lines.length, 1);
      assert.match(lines[0], ANSI_PATTERN);
      assert.match(lines[0], /http\.request\.completed/);
      assert.match(lines[0], /"durationMs":12/);
      assert.match(lines[0].replace(ANSI_PATTERN, ''), /INFO\s+http\.request\.completed/);
    });
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousPretty === undefined) {
      delete process.env.KB_LOG_PRETTY_CONSOLE;
    } else {
      process.env.KB_LOG_PRETTY_CONSOLE = previousPretty;
    }
  }
});

test('logger keeps JSON output in production when pretty console is disabled', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousPretty = process.env.KB_LOG_PRETTY_CONSOLE;
  process.env.NODE_ENV = 'production';
  process.env.KB_LOG_PRETTY_CONSOLE = 'false';

  try {
    withPatchedConsole('warn', (lines) => {
      runWithRequestContext({
        requestId: 'req-json',
        startTime: Date.now(),
        method: 'GET',
        path: '/api/health',
        ip: '127.0.0.1',
      }, () => {
        new AppLogger().warn('health.warning', { detail: 'threshold' });
      });

      assert.equal(lines.length, 1);
      assert.doesNotMatch(lines[0], ANSI_PATTERN);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.level, 'warn');
      assert.equal(parsed.event, 'health.warning');
      assert.equal(parsed.requestId, 'req-json');
      assert.equal(parsed.detail, 'threshold');
    });
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousPretty === undefined) {
      delete process.env.KB_LOG_PRETTY_CONSOLE;
    } else {
      process.env.KB_LOG_PRETTY_CONSOLE = previousPretty;
    }
  }
});
