import { timestamp as drizzleTimestamp } from 'drizzle-orm/pg-core';
import type { PgTimestampConfig } from 'drizzle-orm/pg-core';

export const timestamp = (name: string, config?: PgTimestampConfig) =>
  drizzleTimestamp(name, { withTimezone: true, ...config });
