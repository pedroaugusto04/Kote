import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Update standard category colors to use CSS variables
  pgm.sql(`
    UPDATE kb_categories 
    SET color = CASE name
      WHEN 'event' THEN 'var(--cyan)'
      WHEN 'decision' THEN 'var(--green)'
      WHEN 'knowledge' THEN 'var(--cyan)'
      WHEN 'incident' THEN 'var(--red)'
      WHEN 'followup' THEN 'var(--amber)'
      ELSE color
    END
    WHERE is_system = true;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    UPDATE kb_categories 
    SET color = CASE name
      WHEN 'event' THEN '#3f51b5'
      WHEN 'decision' THEN '#4caf50'
      WHEN 'knowledge' THEN '#2196f3'
      WHEN 'incident' THEN '#f44336'
      WHEN 'followup' THEN '#ff9800'
      ELSE color
    END
    WHERE is_system = true;
  `);
}
