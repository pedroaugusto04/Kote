import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. kb_notes.folder_id: Clean up orphaned folder IDs and add foreign key constraint + index
  pgm.sql(`
    UPDATE kb_notes
    SET folder_id = NULL
    WHERE folder_id IS NOT NULL
      AND folder_id NOT IN (SELECT id FROM kb_project_folders);

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'kb_notes_folder_id_fk'
      ) THEN
        ALTER TABLE kb_notes
        ADD CONSTRAINT kb_notes_folder_id_fk
        FOREIGN KEY (folder_id) REFERENCES kb_project_folders(id) ON DELETE SET NULL;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS kb_notes_folder_id_idx ON kb_notes (folder_id);
  `);

  // 2. kb_dependency_watch.repository_id: Clean up orphaned repo IDs and add foreign key constraint + index
  pgm.sql(`
    UPDATE kb_dependency_watch
    SET repository_id = NULL
    WHERE repository_id IS NOT NULL
      AND repository_id NOT IN (SELECT id FROM kb_repositories);

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'kb_dependency_watch_repository_id_fk'
      ) THEN
        ALTER TABLE kb_dependency_watch
        ADD CONSTRAINT kb_dependency_watch_repository_id_fk
        FOREIGN KEY (repository_id) REFERENCES kb_repositories(id) ON DELETE CASCADE;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS kb_dependency_watch_repository_id_idx ON kb_dependency_watch (repository_id);
  `);

  // 3. kb_note_commit_links.link_source: Normalize to native PostgreSQL enum
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kb_note_commit_link_source_enum') THEN
        CREATE TYPE kb_note_commit_link_source_enum AS ENUM (
          'ai_terminal',
          'session_files',
          'github_push',
          'manual',
          'working_tree'
        );
      END IF;
    END $$;

    UPDATE kb_note_commit_links
    SET link_source = 'ai_terminal'
    WHERE link_source = 'agent_commit';

    UPDATE kb_note_commit_links
    SET link_source = 'manual'
    WHERE link_source NOT IN ('ai_terminal', 'session_files', 'github_push', 'manual', 'working_tree');

    ALTER TABLE kb_note_commit_links ALTER COLUMN link_source DROP DEFAULT;
    ALTER TABLE kb_note_commit_links ALTER COLUMN link_source TYPE kb_note_commit_link_source_enum USING link_source::kb_note_commit_link_source_enum;
    ALTER TABLE kb_note_commit_links ALTER COLUMN link_source SET DEFAULT 'manual';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE kb_note_commit_links ALTER COLUMN link_source DROP DEFAULT;
    ALTER TABLE kb_note_commit_links ALTER COLUMN link_source TYPE text USING link_source::text;
    ALTER TABLE kb_note_commit_links ALTER COLUMN link_source SET DEFAULT 'manual';
    DROP TYPE IF EXISTS kb_note_commit_link_source_enum;

    ALTER TABLE kb_dependency_watch DROP CONSTRAINT IF EXISTS kb_dependency_watch_repository_id_fk;
    DROP INDEX IF EXISTS kb_dependency_watch_repository_id_idx;

    ALTER TABLE kb_notes DROP CONSTRAINT IF EXISTS kb_notes_folder_id_fk;
    DROP INDEX IF EXISTS kb_notes_folder_id_idx;
  `);
}
