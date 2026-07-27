import test from 'node:test';
import assert from 'node:assert/strict';

import { readEnvironment } from '../../dist/adapters/environment.js';

test('readEnvironment parses optional Postgres SSL settings', () => {
  const environment = readEnvironment({
    KB_DATABASE_URL: 'postgres://postgres:postgres@db.example.com:5432/knowledge_base_db',
    KB_DATABASE_SSL_MODE: 'require',
    KB_DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
  });

  assert.deepEqual(environment.allowedExtensionIds, []);
  assert.equal(environment.databaseSslMode, 'require');
  assert.equal(environment.databaseSslRejectUnauthorized, false);
});

test('readEnvironment leaves Postgres SSL settings unset when omitted', () => {
  const environment = readEnvironment({
    KB_DATABASE_URL: 'postgres://postgres:postgres@db.example.com:5432/knowledge_base_db',
  });

  assert.deepEqual(environment.allowedExtensionIds, []);
  assert.equal(environment.databaseSslMode, '');
  assert.equal(environment.databaseSslRejectUnauthorized, null);
});

test('readEnvironment lets Project Brief AI inherit Default Chat AI settings', () => {
  const environment = readEnvironment({
    KB_DEFAULT_CHAT_AI_PROVIDER: 'openai',
    KB_DEFAULT_CHAT_AI_BASE_URL: 'https://ai.example.com/v1',
    KB_DEFAULT_CHAT_AI_MODEL: 'conversation-model',
    KB_DEFAULT_CHAT_AI_API_KEY: 'conversation-key',
  });

  assert.equal(environment.projectBriefAiProvider, 'openai');
  assert.equal(environment.projectBriefAiBaseUrl, 'https://ai.example.com/v1');
  assert.equal(environment.projectBriefAiModel, 'conversation-model');
  assert.equal(environment.projectBriefAiApiKey, 'conversation-key');
});

test('readEnvironment parses GitHub backfill limit with default and bounds', () => {
  assert.equal(readEnvironment({}).githubBackfillLimit, 5);
  assert.equal(readEnvironment({ KB_GITHUB_BACKFILL_LIMIT: '8' }).githubBackfillLimit, 8);
  assert.equal(readEnvironment({ KB_GITHUB_BACKFILL_LIMIT: '0' }).githubBackfillLimit, 5);
  assert.equal(readEnvironment({ KB_GITHUB_BACKFILL_LIMIT: '100' }).githubBackfillLimit, 50);
});
