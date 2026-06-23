import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add user_id column as nullable first (WITHOUT foreign key yet)
  pgm.addColumn('kb_auto_action_global', {
    user_id: { type: 'uuid' },
  });

  // Delete rows with NULL user_id before adding the constraint
  pgm.sql(`DELETE FROM kb_auto_action_global WHERE user_id IS NULL`);

  // Drop the old id column (serial primary key)
  pgm.dropColumn('kb_auto_action_global', 'id');

  // Make user_id NOT NULL
  pgm.alterColumn('kb_auto_action_global', 'user_id', { 
    notNull: true,
  });

  // Add foreign key constraint for user_id (node-pg-migrate doesn't accept
  // `references` inside alterColumn options) using addConstraint
  pgm.addConstraint('kb_auto_action_global', 'kb_auto_action_global_user_fk', {
    foreignKeys: [
      {
        columns: 'user_id',
        references: 'kb_users(id)',
        onDelete: 'CASCADE',
      },
    ],
  });

  // Make user_id the primary key
  pgm.addConstraint('kb_auto_action_global', 'kb_auto_action_global_pkey', {
    primaryKey: 'user_id',
  });

  // Add index on user_id
  pgm.createIndex('kb_auto_action_global', ['user_id'], {
    name: 'kb_auto_action_global_user_idx',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Reverse the changes
  pgm.dropIndex('kb_auto_action_global', 'kb_auto_action_global_user_idx');
  
  // Drop the primary key constraint
  pgm.dropConstraint('kb_auto_action_global', 'kb_auto_action_global_pkey');
  
  // Add back the id column
  pgm.addColumn('kb_auto_action_global', {
    id: { type: 'serial', primaryKey: true },
  });
  
  // Drop user_id column
  pgm.dropColumn('kb_auto_action_global', 'user_id');
  
  // Re-seed default row
  pgm.sql(`INSERT INTO kb_auto_action_global (enabled, action, after_hours) VALUES (false, 'none', NULL)`);
}
