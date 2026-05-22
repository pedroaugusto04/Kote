import crypto from 'node:crypto';

import pg from 'pg';

import { PostgresUserRepository } from '../../dist/infrastructure/repositories/auth.repository.js';
import { PostgresContentRepository } from '../../dist/infrastructure/repositories/content.repository.js';
import { PostgresContentQueryRepository } from '../../dist/infrastructure/repositories/content-query.repository.js';
import { PostgresIntegrationRepository } from '../../dist/infrastructure/repositories/integrations.repository.js';
import { PostgresProjectBriefHistoryRepository } from '../../dist/infrastructure/repositories/project-brief-history.repository.js';
import { PostgresWebhookEventRepository } from '../../dist/infrastructure/repositories/webhook-events.repository.js';
import { PostgresWorkflowStateRepository } from '../../dist/infrastructure/repositories/workflow-state.repository.js';
import { webhookEventFromRow } from '../../dist/infrastructure/mappers/row.mappers.js';
import { PostgresSchemaMigrator } from '../../dist/infrastructure/persistence/schema.migrator.js';
import { readEnvironment } from '../../dist/adapters/environment.js';
import { ContentObjectStorageService } from '../../dist/application/services/content-object-storage.service.js';
import { ObjectStorageMissingContentError } from '../../dist/application/ports/object-storage.js';

const { Pool } = pg;

const DEFAULT_TEST_DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5438/knowledge_base_db_test';
const TEST_DATABASE_NAME = 'knowledge_base_db_test';
const TEST_SCHEMA_PREFIX = 'kb_test_';

function testDatabaseUrl() {
  const rawUrl = process.env.KB_TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
  const url = new URL(rawUrl);
  const databaseName = url.pathname.replace(/^\//, '');
  if (databaseName !== TEST_DATABASE_NAME) {
    throw new Error(`KB_TEST_DATABASE_URL_must_target_${TEST_DATABASE_NAME}`);
  }
  return url;
}

function adminDatabaseUrl(targetUrl) {
  if (process.env.KB_TEST_ADMIN_DATABASE_URL) return new URL(process.env.KB_TEST_ADMIN_DATABASE_URL);
  const url = new URL(targetUrl.toString());
  url.pathname = '/postgres';
  url.search = '';
  return url;
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function ensureTestDatabase(targetUrl) {
  const databaseName = targetUrl.pathname.replace(/^\//, '');
  const adminPool = new Pool({ connectionString: adminDatabaseUrl(targetUrl).toString() });
  try {
    const existing = await adminPool.query('select 1 from pg_database where datname = $1', [databaseName]);
    if (!existing.rows[0]) {
      try {
        await adminPool.query(`create database ${quoteIdent(databaseName)}`);
      } catch (error) {
        if (error?.code !== '42P04' && error?.code !== '23505') throw error;
      }
    }
  } finally {
    await adminPool.end();
  }
}

function createSchemaName() {
  return `${TEST_SCHEMA_PREFIX}${crypto.randomUUID().replaceAll('-', '_')}`;
}

function createDatabase(pool) {
  return {
    isConfigured() {
      return true;
    },
    getPool() {
      return pool;
    },
  };
}

class InMemoryObjectStorage {
  constructor() {
    this.objects = new Map();
    this.deletedKeys = [];
  }

  async put(input) {
    this.objects.set(input.key, Buffer.isBuffer(input.body) ? Buffer.from(input.body) : Buffer.from(String(input.body)));
  }

  async get(key) {
    const object = this.objects.get(key);
    if (!object) throw new ObjectStorageMissingContentError(key);
    return Buffer.from(object);
  }

  async delete(key) {
    this.deletedKeys.push(key);
    this.objects.delete(key);
  }
}

async function dropSchema(targetUrl, schemaName) {
  const pool = new Pool({ connectionString: targetUrl.toString() });
  try {
    await pool.query(`drop schema if exists ${quoteIdent(schemaName)} cascade`);
  } finally {
    await pool.end();
  }
}

export async function createPostgresTestRepositories(t) {
  const targetUrl = testDatabaseUrl();
  await ensureTestDatabase(targetUrl);

  const schemaName = createSchemaName();
  const pool = new Pool({
    connectionString: targetUrl.toString(),
    options: `-c search_path=${schemaName},public`,
  });
  await pool.query(`create schema ${quoteIdent(schemaName)}`);

  const database = createDatabase(pool);
  const schemaMigrator = new PostgresSchemaMigrator(database);
  await schemaMigrator.migrate();

  const userRepository = new PostgresUserRepository(database);
  const integrationRepository = new PostgresIntegrationRepository(database);
  const projectBriefHistoryRepository = new PostgresProjectBriefHistoryRepository(database);
  const objectStorage = new InMemoryObjectStorage();
  const contentObjectStorage = new ContentObjectStorageService(objectStorage);
  const contentRepository = new PostgresContentRepository(database, contentObjectStorage);
  const contentQueryRepository = new PostgresContentQueryRepository(database, contentObjectStorage);
  const workflowStateRepository = new PostgresWorkflowStateRepository(database);
  const webhookEventRepository = new PostgresWebhookEventRepository(database);
  const runtimeEnvironmentProvider = {
    read: () => ({
      ...readEnvironment(),
      databaseUrl: targetUrl.toString(),
    }),
  };

  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    await pool.end();
    await dropSchema(targetUrl, schemaName);
  }

  if (t?.after) t.after(close);

  async function createTestUser(input = {}) {
    const suffix = crypto.randomUUID();
    return userRepository.createUser({
      email: input.email || `user-${suffix}@example.com`,
      displayName: input.displayName || 'Test User',
      passwordHash: input.passwordHash || 'hash',
      role: input.role || 'user',
    });
  }

  async function expireConnectionSession(sessionId) {
    await pool.query(
      `update kb_integration_connection_sessions
       set expires_at = now() - interval '1 second', updated_at = now()
       where id = $1`,
      [sessionId],
    );
  }

  async function countConversationStates() {
    const result = await pool.query('select count(*)::int as count from kb_conversation_states');
    return result.rows[0].count;
  }

  async function getLastWebhookEvent() {
    const result = await pool.query('select * from kb_webhook_events order by created_at desc limit 1');
    return result.rows[0] ? webhookEventFromRow(result.rows[0]) : null;
  }

  return {
    schemaName,
    pool,
    query: pool.query.bind(pool),
    close,
    createTestUser,
    expireConnectionSession,
    countConversationStates,
    getLastWebhookEvent,
    schemaMigrator,
    objectStorage,
    userRepository,
    credentialRepository: integrationRepository,
    projectBriefHistoryRepository,
    externalIdentityRepository: integrationRepository,
    connectionSessionRepository: integrationRepository,
    contentRepository,
    contentQueryRepository,
    conversationStateRepository: workflowStateRepository,
    reminderDispatchRepository: workflowStateRepository,
    webhookEventRepository,
    runtimeEnvironmentProvider,
  };
}
