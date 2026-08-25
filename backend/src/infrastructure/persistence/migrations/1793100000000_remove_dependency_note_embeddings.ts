import type { MigrationBuilder } from 'node-pg-migrate';
import { SourceChannel } from '../../../domain/enums/knowledge.enums.js';

export async function up(pgm: MigrationBuilder): Promise<void> {
  const dependencyWatcher = SourceChannel.DependencyWatcher;
  pgm.sql(`
    DO $$
    BEGIN
      IF to_regclass('kb_note_embeddings') IS NOT NULL THEN
        EXECUTE 'DELETE FROM kb_note_embeddings
                 WHERE note_id IN (
                   SELECT id FROM kb_notes
                   WHERE source_channel = ''${dependencyWatcher}''
                      OR source = ''${dependencyWatcher}''
                 )';
      END IF;
    END
    $$;
  `);
}

export async function down(): Promise<void> {
  // No-op: legacy dependency embeddings do not need to be restored
}
