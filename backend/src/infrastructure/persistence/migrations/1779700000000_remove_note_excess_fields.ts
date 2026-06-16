import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('kb_notes', ['origin', 'source', 'links'], { ifExists: true });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('kb_notes', {
    origin: { type: 'text', notNull: true, default: 'postgres' },
    source: { type: 'text', notNull: true, default: '' },
    links: { type: 'jsonb', notNull: true, default: '[]' },
  });
}
