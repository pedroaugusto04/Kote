import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add color_dark column to kb_categories
  pgm.addColumn('kb_categories', {
    color_dark: { type: 'text', notNull: false, default: null }
  });

  // Update default system category colors with light and dark mode hex codes
  pgm.sql(`
    UPDATE kb_categories 
    SET color = CASE name
      WHEN 'event' THEN '#3f51b5'
      WHEN 'decision' THEN '#4caf50'
      WHEN 'knowledge' THEN '#2196f3'
      WHEN 'incident' THEN '#f44336'
      WHEN 'followup' THEN '#ff9800'
      ELSE color
    END,
    color_dark = CASE name
      WHEN 'event' THEN '#53c7de'
      WHEN 'decision' THEN '#7dd3a5'
      WHEN 'knowledge' THEN '#53c7de'
      WHEN 'incident' THEN '#ff7a7a'
      WHEN 'followup' THEN '#f0b95a'
      ELSE null
    END
    WHERE is_system = true;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('kb_categories', 'color_dark');
}
