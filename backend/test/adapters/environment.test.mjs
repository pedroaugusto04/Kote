import test from 'node:test';
import assert from 'node:assert/strict';

import { readEnvironment } from '../../dist/adapters/environment.js';

test('readEnvironment parses optional Postgres SSL settings', () => {
  const environment = readEnvironment({
    KB_DATABASE_URL: 'postgres://postgres:postgres@db.example.com:5432/knowledge_base_db',
    KB_DATABASE_SSL_MODE: 'require',
    KB_DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
  });

  assert.equal(environment.databaseSslMode, 'require');
  assert.equal(environment.databaseSslRejectUnauthorized, false);
});

test('readEnvironment leaves Postgres SSL settings unset when omitted', () => {
  const environment = readEnvironment({
    KB_DATABASE_URL: 'postgres://postgres:postgres@db.example.com:5432/knowledge_base_db',
  });

  assert.equal(environment.databaseSslMode, '');
  assert.equal(environment.databaseSslRejectUnauthorized, null);
});
