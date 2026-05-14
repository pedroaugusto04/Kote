import { Injectable } from '@nestjs/common';
import pg from 'pg';

import { readEnvironment } from '../../adapters/environment.js';

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
export class PostgresDatabase {
  private pool: pg.Pool | null = null;

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
}
