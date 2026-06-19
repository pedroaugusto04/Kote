import crypto from 'node:crypto';

import pg from 'pg';

import { PostgresUserRepository } from '../../dist/infrastructure/repositories/auth.repository.js';
import { PostgresContentRepository } from '../../dist/infrastructure/repositories/content.repository.js';
import { PostgresContentQueryRepository } from '../../dist/infrastructure/repositories/content-query.repository.js';
import { PostgresIntegrationRepository } from '../../dist/infrastructure/repositories/integrations.repository.js';
import { PostgresProjectBriefHistoryRepository } from '../../dist/infrastructure/repositories/project-brief-history.repository.js';
import { PostgresAskHistoryRepository } from '../../dist/infrastructure/repositories/ask-history.repository.js';
import { PostgresWebhookEventRepository } from '../../dist/infrastructure/repositories/webhook-events.repository.js';
import { PostgresPushSubscriptionRepository } from '../../dist/infrastructure/repositories/push-subscription.repository.js';
import { PostgresWorkflowStateRepository } from '../../dist/infrastructure/repositories/workflow-state.repository.js';
import { webhookEventFromRow } from '../../dist/infrastructure/mappers/row.mappers.js';
import { PostgresSchemaMigrator } from '../../dist/infrastructure/persistence/schema.migrator.js';
import { readEnvironment } from '../../dist/adapters/environment.js';
import { ContentObjectStorageService } from '../../dist/application/services/content-object-storage.service.js';
import { ObjectStorageMissingContentError } from '../../dist/application/ports/notes/object-storage.js';
import { PostgresWorkspaceRepository } from '../../dist/infrastructure/repositories/workspace.repository.js';
import { PostgresProjectRepository } from '../../dist/infrastructure/repositories/project.repository.js';
import { PostgresNoteRepository } from '../../dist/infrastructure/repositories/note.repository.js';
import { PostgresFolderRepository } from '../../dist/infrastructure/repositories/folder.repository.js';
import { PostgresAttachmentRepository } from '../../dist/infrastructure/repositories/attachment.repository.js';
import { PostgresCategoryRepository } from '../../dist/infrastructure/repositories/category.repository.js';

import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../dist/infrastructure/persistence/schema/index.js';

const { Pool } = pg;

const DEFAULT_TEST_DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5438/knowledge_base_db_test';
const TEST_DATABASE_NAME = 'knowledge_base_db_test';
const TEST_SCHEMA_PREFIX = 'kb_test_';
const BASE_SCHEMA_NAME = 'kb_test_base';

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
  let db = null;
  return {
    isConfigured() {
      return true;
    },
    getPool() {
      return pool;
    },
    getDb() {
      if (db) return db;
      db = drizzle(pool, { schema });
      return db;
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

async function ensureBaseSchema(targetUrl) {
  const adminPool = new Pool({ connectionString: targetUrl.toString() });
  try {
    await adminPool.query(`drop schema if exists ${quoteIdent(BASE_SCHEMA_NAME)} cascade`);
    await adminPool.query(`create schema ${quoteIdent(BASE_SCHEMA_NAME)}`);
  } finally {
    await adminPool.end();
  }

  const pool = new Pool({
    connectionString: targetUrl.toString(),
    options: `-c search_path=${BASE_SCHEMA_NAME}`,
  });
  try {
    const database = createDatabase(pool);
    const schemaMigrator = new PostgresSchemaMigrator(database);
    await schemaMigrator.migrate();
  } finally {
    await pool.end();
  }
}

async function truncateSchema(targetUrl, schemaName) {
  const pool = new Pool({ connectionString: targetUrl.toString() });
  try {
    // Get all tables in the schema
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1 AND table_type = 'BASE TABLE'
    `, [schemaName]);

    // Truncate all tables (disable foreign key checks temporarily)
    await pool.query('SET session_replication_role = replica');

    for (const table of tables.rows) {
      await pool.query(`truncate table ${quoteIdent(schemaName)}.${quoteIdent(table.table_name)} cascade`);
    }

    await pool.query('SET session_replication_role = DEFAULT');

    // Reset sequences
    const sequences = await pool.query(`
      SELECT sequence_name 
      FROM information_schema.sequences 
      WHERE sequence_schema = $1
    `, [schemaName]);

    for (const seq of sequences.rows) {
      await pool.query(`alter sequence ${quoteIdent(schemaName)}.${quoteIdent(seq.sequence_name)} restart with 1`);
    }
  } finally {
    await pool.end();
  }
}

export async function createPostgresTestRepositories(t) {
  const targetUrl = testDatabaseUrl();
  await ensureTestDatabase(targetUrl);

  // Ensure base schema exists with migrations (runs once)
  await ensureBaseSchema(targetUrl);

  // Use the base schema directly for all tests
  const schemaName = BASE_SCHEMA_NAME;
  const pool = new Pool({
    connectionString: targetUrl.toString(),
    options: `-c search_path=${schemaName},public`,
  });

  // Truncate all tables to clean up before test (much faster than migrations)
  await truncateSchema(targetUrl, schemaName);

  const database = createDatabase(pool);
  const schemaMigrator = {
    async migrate() { }
  };

  const userRepository = new PostgresUserRepository(database);
  const integrationRepository = new PostgresIntegrationRepository(database);
  const projectBriefHistoryRepository = new PostgresProjectBriefHistoryRepository(database);
  const askHistoryRepository = new PostgresAskHistoryRepository(database);
  const objectStorage = new InMemoryObjectStorage();
  const contentObjectStorage = new ContentObjectStorageService(objectStorage);

  const workspaceRepository = new PostgresWorkspaceRepository(database);
  const projectRepository = new PostgresProjectRepository(database);
  const noteRepository = new PostgresNoteRepository(database, contentObjectStorage);
  const folderRepository = new PostgresFolderRepository(database);
  const attachmentRepository = new PostgresAttachmentRepository(database, contentObjectStorage);
  const categoryRepository = new PostgresCategoryRepository(database);

  const contentRepository = new PostgresContentRepository(
    workspaceRepository,
    projectRepository,
    noteRepository,
    folderRepository,
    attachmentRepository,
    categoryRepository,
    contentObjectStorage
  );
  const contentQueryRepository = new PostgresContentQueryRepository(database, contentObjectStorage);
  const workflowStateRepository = new PostgresWorkflowStateRepository(database);
  const pushSubscriptionRepository = new PostgresPushSubscriptionRepository(database);
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
    // Don't drop the base schema - it's reused across tests
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
    objectStorage,
    userRepository,
    credentialRepository: integrationRepository,
    projectBriefHistoryRepository,
    askHistoryRepository,
    externalIdentityRepository: integrationRepository,
    connectionSessionRepository: integrationRepository,
    contentRepository,
    contentQueryRepository,
    conversationStateRepository: workflowStateRepository,
    reminderDispatchRepository: workflowStateRepository,
    webhookEventRepository,
    runtimeEnvironmentProvider,
    pushSubscriptionRepository,
    schemaMigrator,
  };
}
