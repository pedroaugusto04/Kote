import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    UPDATE kb_notes n
    SET tags = COALESCE(
      (
        SELECT jsonb_agg(tag)
        FROM jsonb_array_elements_text(n.tags) AS tag
        WHERE tag <> p.project_slug
          AND NOT EXISTS (
            SELECT 1
            FROM kb_project_default_tags dt
            WHERE dt.project_id = p.id
              AND dt.tag = tag
          )
      ),
      '[]'::jsonb
    )
    FROM kb_projects p
    WHERE n.project_id = p.id;
  `);
}

export async function down(): Promise<void> {
  // Data cleanup is intentionally not reversible without reintroducing derived tags.
}
