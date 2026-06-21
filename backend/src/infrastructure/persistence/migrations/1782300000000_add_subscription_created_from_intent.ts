import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('kb_user_subscriptions', {
    created_from_intent_id: {
      type: 'uuid',
      references: 'kb_billing_intents(id)',
      onDelete: 'SET NULL',
    },
  });

  pgm.createIndex('kb_user_subscriptions', ['created_from_intent_id'], {
    name: 'idx_user_subscriptions_created_from_intent',
    where: 'created_from_intent_id IS NOT NULL',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('kb_user_subscriptions', ['created_from_intent_id'], {
    name: 'idx_user_subscriptions_created_from_intent',
  });
  pgm.dropColumn('kb_user_subscriptions', ['created_from_intent_id']);
}
