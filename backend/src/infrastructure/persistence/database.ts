import { Injectable } from '@nestjs/common';
import pg from 'pg';

import { readEnvironment } from '../../adapters/environment.js';

const { Pool } = pg;

@Injectable()
export class PostgresDatabase {
  private pool: pg.Pool | null = null;

  isConfigured(): boolean {
    return Boolean(readEnvironment().databaseUrl);
  }

  getPool(): pg.Pool {
    if (this.pool) return this.pool;

    const connectionString = readEnvironment().databaseUrl;
    if (!connectionString) throw new Error('KB_DATABASE_URL_not_configured');

    this.pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false, 
      },
    });

    return this.pool;
  }
}