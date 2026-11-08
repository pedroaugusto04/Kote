import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';

import { PostgresDatabase } from '../../dist/infrastructure/persistence/database.js';

test('PostgresDatabase creates pool with environment-configured settings and keepAlive', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    KB_DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/test_db',
    KB_DATABASE_POOL_MAX: '35',
    KB_DATABASE_CONNECTION_TIMEOUT_MS: '12000',
    KB_DATABASE_IDLE_TIMEOUT_MS: '40000',
    KB_DATABASE_STATEMENT_TIMEOUT_MS: '25000',
  };

  try {
    const db = new PostgresDatabase();
    assert.equal(db.isConfigured(), true);
    assert.equal(db.getPoolStatus(), null);

    const pool = db.getPool();
    assert.ok(pool);
    assert.equal(pool.options.max, 35);
    assert.equal(pool.options.connectionTimeoutMillis, 12000);
    assert.equal(pool.options.idleTimeoutMillis, 40000);
    assert.equal(pool.options.statement_timeout, 25000);
    assert.equal(pool.options.keepAlive, true);
    assert.equal(pool.options.keepAliveInitialDelayMillis, 10000);

    const status = db.getPoolStatus();
    assert.ok(status);
    assert.equal(typeof status.total, 'number');
    assert.equal(typeof status.idle, 'number');
    assert.equal(typeof status.waiting, 'number');

    await db.onModuleDestroy();
    assert.equal(db.getPoolStatus(), null);
  } finally {
    process.env = originalEnv;
  }
});
