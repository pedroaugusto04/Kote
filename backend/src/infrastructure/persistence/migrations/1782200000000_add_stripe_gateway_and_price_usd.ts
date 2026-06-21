import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Add 'stripe' to the payment gateway enum
  // Note: ALTER TYPE ... ADD VALUE cannot be executed inside a multi-statement transaction in older PG versions,
  // but node-pg-migrate handles single/multi transactions. Since PostgreSQL 12, it is allowed in transactions.
  pgm.sql(`ALTER TYPE kb_payment_gateway_enum ADD VALUE IF NOT EXISTS 'stripe';`);

  // 2. Add price_usd_cents column to kb_plans table
  pgm.addColumn('kb_plans', {
    price_usd_cents: { type: 'integer', notNull: true, default: 0 },
  });

  // 3. Update existing plans with initial USD values based on BRL prices:
  // - Free: 0 BRL -> 0 USD
  // - Pro: 20 BRL (2000 cents) -> 4.99 USD (499 cents)
  // - Enterprise: 99 BRL (9900 cents) -> 19.99 USD (1999 cents)
  pgm.sql(`
    UPDATE kb_plans 
    SET price_usd_cents = 0 
    WHERE slug = 'free';
  `);

  pgm.sql(`
    UPDATE kb_plans 
    SET price_usd_cents = 499 
    WHERE slug = 'pro';
  `);

  pgm.sql(`
    UPDATE kb_plans 
    SET price_usd_cents = 1999 
    WHERE slug = 'enterprise';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // 1. Remove price_usd_cents column
  pgm.dropColumn('kb_plans', ['price_usd_cents']);

  // Note: PostgreSQL does not support removing values from an ENUM type easily.
  // The down migration typically leaves the value in the enum, which is safe.
}
