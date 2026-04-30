import { Injectable } from '@nestjs/common';
import { runner } from 'node-pg-migrate';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SchemaMigrator } from '../../application/ports/auth.repository.js';
import { PostgresDatabase } from './database.js';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const migrationsTable = 'kb_schema_migrations';

export async function runPostgresMigrations(database: PostgresDatabase, direction: 'up' | 'down' = 'up') {
  if (!database.isConfigured()) return [];

  const client = await database.getPool().connect();

  try {
    const schemaResult = await client.query<{ schema: string }>('select current_schema() as schema');
    const currentSchema = String(schemaResult.rows[0]?.schema || 'public');

    return await runner({
      dbClient: client,
      dir: migrationsDir,
      ignorePattern: '.*\\.map',
      direction,
      migrationsTable,
      migrationsSchema: currentSchema,
      schema: currentSchema,
      createMigrationsSchema: true,
      checkOrder: true,
      singleTransaction: true,
      noLock: currentSchema !== 'public',
    });
  } finally {
    client.release();
  }
}

@Injectable()
export class PostgresSchemaMigrator extends SchemaMigrator {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async migrate() {
    await runPostgresMigrations(this.database, 'up');
  }
}
