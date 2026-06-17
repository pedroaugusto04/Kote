import type { Config } from 'drizzle-kit';

export default {
  schema: './src/infrastructure/persistence/schema',
  out: './src/infrastructure/persistence/drizzle-migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.KB_DATABASE_URL || '',
  },
} satisfies Config;
