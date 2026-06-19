import { PostgresDatabase } from './database.js';
import { runPostgresMigrations } from './schema.migrator.js';
import { MigrationDirection } from '../../contracts/enums.js';

const direction = process.env.KB_MIGRATION_DIRECTION === 'down' ? MigrationDirection.Down : MigrationDirection.Up;

await runPostgresMigrations(new PostgresDatabase(), direction);
