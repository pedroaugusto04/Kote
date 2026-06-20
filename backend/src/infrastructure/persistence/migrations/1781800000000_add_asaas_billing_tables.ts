import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Create billing custom ENUM types in Postgres
  pgm.sql(`CREATE TYPE kb_payment_gateway_enum AS ENUM ('asaas');`);
  pgm.sql(`CREATE TYPE kb_billing_cycle_enum AS ENUM ('monthly', 'yearly');`);
  pgm.sql(`CREATE TYPE kb_billing_type_enum AS ENUM ('boleto', 'pix', 'credit_card');`);
  pgm.sql(`CREATE TYPE kb_payment_status_enum AS ENUM ('pending', 'received', 'confirmed', 'overdue', 'refunded', 'canceled', 'partially_refunded');`);
  pgm.sql(`CREATE TYPE kb_billing_intent_type_enum AS ENUM ('new', 'upgrade', 'change_cycle');`);
  pgm.sql(`CREATE TYPE kb_billing_intent_status_enum AS ENUM ('pending', 'processing', 'done', 'failed', 'canceled');`);
  pgm.sql(`CREATE TYPE kb_webhook_process_status_enum AS ENUM ('pending', 'processing', 'done', 'failed');`);
  pgm.sql(`CREATE TYPE kb_subscription_change_status_enum AS ENUM ('scheduled', 'applied', 'canceled');`);
  pgm.sql(`CREATE TYPE kb_subscription_change_type_enum AS ENUM ('downgrade', 'change_cycle');`);
  pgm.sql(`CREATE TYPE kb_payment_kind_enum AS ENUM ('recurring', 'upgrade');`);

  // 2. Alter kb_user_subscriptions table to add Asaas specific fields
  pgm.addColumn('kb_user_subscriptions', {
    billing_cycle: { type: 'kb_billing_cycle_enum', notNull: true, default: 'monthly' },
    billing_type: { type: 'kb_billing_type_enum' },
    next_due_date: { type: 'timestamptz' },
    started_at: { type: 'timestamptz' },
    past_due_at: { type: 'timestamptz' },
    canceled_at: { type: 'timestamptz' },
  });

  // 3. Create kb_billing_customers table
  pgm.createTable('kb_billing_customers', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'kb_users(id)', onDelete: 'CASCADE' },
    gateway: { type: 'kb_payment_gateway_enum', notNull: true, default: 'asaas' },
    gateway_customer_id: { type: 'text', notNull: true },
    has_credit_card_on_file: { type: 'boolean', notNull: true, default: false },
    credit_card_token: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addIndex('kb_billing_customers', ['user_id', 'gateway'], { unique: true, name: 'uq_billing_user_gateway' });
  pgm.addIndex('kb_billing_customers', ['gateway', 'gateway_customer_id'], { unique: true, name: 'uq_gateway_customer_id' });

  // 4. Create kb_billing_payments table (equivalent to subscription_payments)
  pgm.createTable('kb_billing_payments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    subscription_id: { type: 'uuid', references: 'kb_user_subscriptions(user_id)', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'kb_users(id)', onDelete: 'CASCADE' },
    gateway: { type: 'kb_payment_gateway_enum', notNull: true },
    gateway_payment_id: { type: 'text', notNull: true },
    status: { type: 'kb_payment_status_enum', notNull: true, default: 'pending' },
    billing_type: { type: 'kb_billing_type_enum' },
    kind: { type: 'kb_payment_kind_enum', notNull: true, default: 'recurring' },
    gateway_status: { type: 'text' },
    value: { type: 'decimal(10,2)', notNull: true },
    due_date: { type: 'timestamptz', notNull: true },
    paid_at: { type: 'timestamptz' },
    invoice_url: { type: 'text' },
    bank_slip_url: { type: 'text' },
    pix_qr_code: { type: 'text' },
    pix_qr_code_url: { type: 'text' },
    description: { type: 'text' },
    last_gateway_event_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addIndex('kb_billing_payments', ['user_id', 'gateway', 'gateway_payment_id'], { unique: true, name: 'uq_user_gateway_payment' });
  pgm.addIndex('kb_billing_payments', ['user_id'], { name: 'idx_billing_payments_user' });

  // 5. Create kb_billing_intents table
  pgm.createTable('kb_billing_intents', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    type: { type: 'kb_billing_intent_type_enum', notNull: true },
    status: { type: 'kb_billing_intent_status_enum', notNull: true, default: 'pending' },
    user_id: { type: 'uuid', notNull: true, references: 'kb_users(id)', onDelete: 'CASCADE' },
    plan_id: { type: 'uuid', references: 'kb_plans(id)', onDelete: 'RESTRICT' },
    subscription_id: { type: 'uuid', references: 'kb_user_subscriptions(user_id)', onDelete: 'SET NULL' },
    billing_cycle: { type: 'kb_billing_cycle_enum' },
    credit_card_token: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addIndex('kb_billing_intents', ['user_id'], { name: 'idx_billing_intents_user' });
  pgm.addIndex('kb_billing_intents', ['status'], { name: 'idx_billing_intents_status' });

  // 6. Create kb_subscription_change_requests table
  pgm.createTable('kb_subscription_change_requests', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'kb_users(id)', onDelete: 'CASCADE' },
    from_subscription_id: { type: 'uuid', notNull: true, references: 'kb_user_subscriptions(user_id)' },
    from_gateway: { type: 'kb_payment_gateway_enum', notNull: true },
    from_gateway_subscription_id: { type: 'text', notNull: true },
    to_plan_id: { type: 'uuid', notNull: true, references: 'kb_plans(id)' },
    to_billing_cycle: { type: 'kb_billing_cycle_enum', notNull: true },
    to_billing_type: { type: 'kb_billing_type_enum', notNull: true, default: 'credit_card' },
    type: { type: 'kb_subscription_change_type_enum', notNull: true, default: 'change_cycle' },
    status: { type: 'kb_subscription_change_status_enum', notNull: true, default: 'scheduled' },
    effective_at: { type: 'timestamptz', notNull: true },
    attempts: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addIndex('kb_subscription_change_requests', ['user_id'], { name: 'idx_sub_change_user' });
  pgm.addIndex('kb_subscription_change_requests', ['status', 'effective_at'], { name: 'idx_sub_change_status_effective' });

  // 7. Create kb_gateway_webhook_events table
  pgm.createTable('kb_gateway_webhook_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    gateway: { type: 'kb_payment_gateway_enum', notNull: true },
    dedup_key: { type: 'text', notNull: true },
    event_type: { type: 'text', notNull: true },
    gateway_event_id: { type: 'text' },
    gateway_payment_id: { type: 'text' },
    gateway_subscription_id: { type: 'text' },
    payload: { type: 'jsonb' },
    status: { type: 'kb_webhook_process_status_enum', notNull: true, default: 'pending' },
    attempts: { type: 'integer', notNull: true, default: 0 },
    last_error: { type: 'text' },
    last_dispatched_at: { type: 'timestamptz' },
    processed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addIndex('kb_gateway_webhook_events', ['gateway', 'dedup_key'], { unique: true, name: 'uq_gateway_webhook_dedup' });
  pgm.addIndex('kb_gateway_webhook_events', ['status', 'created_at'], { name: 'idx_webhook_status_created' });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('kb_gateway_webhook_events');
  pgm.dropTable('kb_subscription_change_requests');
  pgm.dropTable('kb_billing_intents');
  pgm.dropTable('kb_billing_payments');
  pgm.dropTable('kb_billing_customers');

  pgm.dropColumn('kb_user_subscriptions', [
    'billing_cycle',
    'billing_type',
    'next_due_date',
    'started_at',
    'past_due_at',
    'canceled_at',
  ]);

  pgm.sql(`DROP TYPE IF EXISTS kb_payment_kind_enum;`);
  pgm.sql(`DROP TYPE IF EXISTS kb_subscription_change_type_enum;`);
  pgm.sql(`DROP TYPE IF EXISTS kb_subscription_change_status_enum;`);
  pgm.sql(`DROP TYPE IF EXISTS kb_webhook_process_status_enum;`);
  pgm.sql(`DROP TYPE IF EXISTS kb_billing_intent_status_enum;`);
  pgm.sql(`DROP TYPE IF EXISTS kb_billing_intent_type_enum;`);
  pgm.sql(`DROP TYPE IF EXISTS kb_payment_status_enum;`);
  pgm.sql(`DROP TYPE IF EXISTS kb_billing_type_enum;`);
  pgm.sql(`DROP TYPE IF EXISTS kb_billing_cycle_enum;`);
  pgm.sql(`DROP TYPE IF EXISTS kb_payment_gateway_enum;`);
}
