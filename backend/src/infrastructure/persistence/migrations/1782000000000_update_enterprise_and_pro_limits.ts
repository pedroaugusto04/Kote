import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Update Free plan: English display name/description
  pgm.sql(`
    UPDATE kb_plans 
    SET display_name = 'Free',
        description = 'Basic free plan'
    WHERE slug = 'free';
  `);

  // Update Pro plan: 500 AI queries per month, and English display name/description
  pgm.sql(`
    UPDATE kb_plans 
    SET display_name = 'Pro',
        description = 'Professional plan for individuals',
        max_ai_requests_per_month = 500 
    WHERE slug = 'pro';
  `);

  // Update Enterprise plan: unlimited workspaces, unlimited projects per workspace, 2k AI queries/month, 100 GB storage, English display name/description
  // 100 GB = 100 * 1024 * 1024 * 1024 = 107374182400 bytes
  pgm.sql(`
    UPDATE kb_plans 
    SET display_name = 'Enterprise',
        description = 'Corporate plan with unlimited resources',
        max_workspaces = -1,
        max_projects_per_workspace = -1,
        max_ai_requests_per_month = 2000,
        max_storage_bytes = 107374182400
    WHERE slug = 'enterprise';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Revert descriptions to Portuguese
  pgm.sql(`
    UPDATE kb_plans 
    SET display_name = 'Free',
        description = 'Plano básico gratuito'
    WHERE slug = 'free';
  `);

  pgm.sql(`
    UPDATE kb_plans 
    SET display_name = 'Pro',
        description = 'Plano profissional para indivíduos',
        max_ai_requests_per_month = 1000 
    WHERE slug = 'pro';
  `);

  pgm.sql(`
    UPDATE kb_plans 
    SET display_name = 'Enterprise',
        description = 'Plano corporativo com recursos ilimitados',
        max_workspaces = -1,
        max_projects_per_workspace = -1,
        max_ai_requests_per_month = -1,
        max_storage_bytes = -1
    WHERE slug = 'enterprise';
  `);
}
