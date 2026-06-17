import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { readEnvironment } from '../../adapters/environment.js';
import * as schema from './schema/index.js';

const { Pool } = pg;

function resolveSslMode(databaseUrl: string, configuredSslMode: string): string {
  if (configuredSslMode) return configuredSslMode;

  try {
    return new URL(databaseUrl).searchParams.get('sslmode')?.trim().toLowerCase() || '';
  } catch {
    return '';
  }
}

function buildSslConfig(environment: ReturnType<typeof readEnvironment>): pg.PoolConfig['ssl'] {
  const sslMode = resolveSslMode(environment.databaseUrl, environment.databaseSslMode);
  if (!sslMode || ['disable', 'allow', 'prefer'].includes(sslMode)) return false;

  const rejectUnauthorized = environment.databaseSslRejectUnauthorized
    ?? ['verify-ca', 'verify-full'].includes(sslMode);

  return { rejectUnauthorized };
}

@Injectable()
export class PostgresDatabase implements OnModuleDestroy {
  private pool: pg.Pool | null = null;
  private db: ReturnType<typeof drizzle> | null = null;

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
    this.pool = null;
    this.db = null;
  }

  isConfigured(): boolean {
    return Boolean(readEnvironment().databaseUrl);
  }

  getPool(): pg.Pool {
    if (this.pool) return this.pool;

    const environment = readEnvironment();
    const connectionString = environment.databaseUrl;
    if (!connectionString) throw new Error('KB_DATABASE_URL_not_configured');

    this.pool = new Pool({
      connectionString,
      ssl: buildSslConfig(environment),
    });

    return this.pool;
  }

  getDb() {
    if (this.db) return this.db;

    const pool = this.getPool();
    this.db = drizzle(pool, { schema });
    return this.db;
  }
}
