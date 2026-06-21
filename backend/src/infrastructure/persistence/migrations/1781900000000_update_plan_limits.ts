import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Update plans:
  // 1. Free plan: 5 GB storage (5368709120 bytes)
  pgm.sql(`
    UPDATE kb_plans 
    SET max_storage_bytes = 5368709120 
    WHERE slug = 'free';
  `);

  // 2. Pro plan: 20 BRL/month (2000 cents), 25 GB storage (26843545600 bytes), 3 workspaces
  pgm.sql(`
    UPDATE kb_plans 
    SET price_cents = 2000, 
        max_storage_bytes = 26843545600, 
        max_workspaces = 3 
    WHERE slug = 'pro';
  `);

  // 3. Enterprise plan: -1 for infinite storage, AI requests, workspaces, and projects
  pgm.sql(`
    UPDATE kb_plans 
    SET max_storage_bytes = -1, 
        max_ai_requests_per_month = -1, 
        max_workspaces = -1, 
        max_projects_per_workspace = -1 
    WHERE slug = 'enterprise';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Revert back to original seed values
  pgm.sql(`
    UPDATE kb_plans 
    SET max_storage_bytes = 52428800 
    WHERE slug = 'free';
  `);

  pgm.sql(`
    UPDATE kb_plans 
    SET price_cents = 2900, 
        max_storage_bytes = 5368709120, 
        max_workspaces = 5 
    WHERE slug = 'pro';
  `);

  pgm.sql(`
    UPDATE kb_plans 
    SET max_storage_bytes = 107374182400, 
        max_ai_requests_per_month = 10000, 
        max_workspaces = 999, 
        max_projects_per_workspace = 999 
    WHERE slug = 'enterprise';
  `);
}
