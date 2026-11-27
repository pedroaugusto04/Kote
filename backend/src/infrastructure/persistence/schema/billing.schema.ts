import { pgTable, uuid, text, jsonb, boolean, bigint, integer, index, uniqueIndex, decimal } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { timestamp } from './column-helpers.js';
import {
  billingCycleEnum,
  billingIntentStatusEnum,
  billingIntentTypeEnum,
  billingTypeEnum,
  paymentGatewayEnum,
  paymentKindEnum,
  paymentStatusEnum,
  subscriptionChangeStatusEnum,
  subscriptionChangeTypeEnum,
  webhookProcessStatusEnum,
} from './enums.schema.js';
import { users } from './auth.schema.js';

// Plans table
export const plans = pgTable('kb_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull(), // 'free', 'pro', 'enterprise'
  displayName: text('display_name').notNull(),
  description: text('description').notNull().default(''),
  maxStorageBytes: bigint('max_storage_bytes', { mode: 'number' }).notNull(),
  maxAiCreditsPerMonth: integer('max_ai_credits_per_month').notNull(),
  maxWorkspaces: integer('max_workspaces').notNull(),
  maxProjectsPerWorkspace: integer('max_projects_per_workspace').notNull(),
  priceCents: integer('price_cents').notNull().default(0),
  priceUsdCents: integer('price_usd_cents').notNull().default(0),
  billingPeriod: text('billing_period').notNull().default('monthly'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  slugUniqueIdx: uniqueIndex('kb_plans_slug_idx').on(table.slug),
}));

// User Subscriptions table
export const userSubscriptions = pgTable('kb_user_subscriptions', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  status: text('status').notNull().default('active'), // active, pending, past_due, canceled, inactive
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull().defaultNow(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull().defaultNow(),
  gatewayName: text('gateway_name').notNull().default('asaas'), // 'asaas', 'stripe', etc.
  gatewaySubscriptionId: text('gateway_subscription_id'),
  billingCycle: billingCycleEnum('billing_cycle').notNull().default('monthly'),
  billingType: billingTypeEnum('billing_type'),
  nextDueDate: timestamp('next_due_date', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  pastDueAt: timestamp('past_due_at', { withTimezone: true }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  createdFromIntentId: uuid('created_from_intent_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Billing Customers table
export const billingCustomers = pgTable('kb_billing_customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  gateway: paymentGatewayEnum('gateway').notNull().default('asaas'),
  gatewayCustomerId: text('gateway_customer_id').notNull(),
  hasCreditCardOnFile: boolean('has_credit_card_on_file').notNull().default(false),
  creditCardToken: text('credit_card_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userGatewayUniqueIdx: uniqueIndex('uq_billing_user_gateway').on(table.userId, table.gateway),
  gatewayCustomerUniqueIdx: uniqueIndex('uq_gateway_customer_id').on(table.gateway, table.gatewayCustomerId),
}));

// Billing Payments table
export const billingPayments = pgTable('kb_billing_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').references(() => userSubscriptions.userId, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  gateway: paymentGatewayEnum('gateway').notNull(),
  gatewayPaymentId: text('gateway_payment_id').notNull(),
  status: paymentStatusEnum('status').notNull().default('pending'),
  billingType: billingTypeEnum('billing_type'),
  kind: paymentKindEnum('kind').notNull().default('recurring'),
  gatewayStatus: text('gateway_status'),
  value: decimal('value', { precision: 10, scale: 2 }).notNull(),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  invoiceUrl: text('invoice_url'),
  bankSlipUrl: text('bank_slip_url'),
  pixQrCode: text('pix_qr_code'),
  pixQrCodeUrl: text('pix_qr_code_url'),
  description: text('description'),
  stripeClientSecret: text('stripe_client_secret'),
  lastGatewayEventAt: timestamp('last_gateway_event_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userGatewayPaymentUniqueIdx: uniqueIndex('uq_user_gateway_payment').on(table.userId, table.gateway, table.gatewayPaymentId),
  userIdx: index('idx_billing_payments_user').on(table.userId),
}));

// Billing Intents table
export const billingIntents = pgTable('kb_billing_intents', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: billingIntentTypeEnum('type').notNull(),
  status: billingIntentStatusEnum('status').notNull().default('pending'),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').references(() => plans.id, { onDelete: 'restrict' }),
  subscriptionId: uuid('subscription_id').references(() => userSubscriptions.userId, { onDelete: 'set null' }),
  billingCycle: billingCycleEnum('billing_cycle'),
  creditCardToken: text('credit_card_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('idx_billing_intents_user').on(table.userId),
  statusIdx: index('idx_billing_intents_status').on(table.status),
}));

// Subscription Change Requests table
export const subscriptionChangeRequests = pgTable('kb_subscription_change_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fromSubscriptionId: uuid('from_subscription_id').notNull().references(() => userSubscriptions.userId),
  fromGateway: paymentGatewayEnum('from_gateway').notNull(),
  fromGatewaySubscriptionId: text('from_gateway_subscription_id').notNull(),
  toPlanId: uuid('to_plan_id').notNull().references(() => plans.id),
  toBillingCycle: billingCycleEnum('to_billing_cycle').notNull(),
  toBillingType: billingTypeEnum('to_billing_type').notNull().default('credit_card'),
  type: subscriptionChangeTypeEnum('type').notNull().default('change_cycle'),
  status: subscriptionChangeStatusEnum('status').notNull().default('scheduled'),
  effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index('idx_sub_change_user').on(table.userId),
  statusEffectiveIdx: index('idx_sub_change_status_effective').on(table.status, table.effectiveAt),
}));

// Gateway Webhook Events table
export const gatewayWebhookEvents = pgTable('kb_gateway_webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  gateway: paymentGatewayEnum('gateway').notNull(),
  dedupKey: text('dedup_key').notNull(),
  eventType: text('event_type').notNull(),
  gatewayEventId: text('gateway_event_id'),
  gatewayPaymentId: text('gateway_payment_id'),
  gatewaySubscriptionId: text('gateway_subscription_id'),
  payload: jsonb('payload'),
  status: webhookProcessStatusEnum('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  lastDispatchedAt: timestamp('last_dispatched_at', { withTimezone: true }),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  gatewayDedupUniqueIdx: uniqueIndex('uq_gateway_webhook_dedup').on(table.gateway, table.dedupKey),
  statusCreatedIdx: index('idx_webhook_status_created').on(table.status, table.createdAt),
}));

// Quota Usage Events table
export const quotaUsageEvents = pgTable('kb_quota_usage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'ai_request', 'transcription', etc.
  amount: integer('amount').notNull().default(1),
  description: text('description'),
  metadata: jsonb('metadata').notNull().default('{}'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdTypeCreatedIdx: index('kb_quota_usage_events_user_type_created_idx').on(table.userId, table.type, table.createdAt),
}));

// Quota Adjustments table
export const quotaAdjustments = pgTable('kb_quota_adjustments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'storage', 'ai_request', etc.
  amount: bigint('amount', { mode: 'number' }).notNull(), // positive for additions, negative for reductions
  description: text('description'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdTypeIdx: index('kb_quota_adjustments_user_type_idx').on(table.userId, table.type),
}));

// Billing & Quota Relations
export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(userSubscriptions),
}));

export const userSubscriptionsRelations = relations(userSubscriptions, ({ one, many }) => ({
  user: one(users, {
    fields: [userSubscriptions.userId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [userSubscriptions.planId],
    references: [plans.id],
  }),
  payments: many(billingPayments),
  changeRequests: many(subscriptionChangeRequests),
}));

export const billingCustomersRelations = relations(billingCustomers, ({ one }) => ({
  user: one(users, {
    fields: [billingCustomers.userId],
    references: [users.id],
  }),
}));

export const billingPaymentsRelations = relations(billingPayments, ({ one }) => ({
  user: one(users, {
    fields: [billingPayments.userId],
    references: [users.id],
  }),
  subscription: one(userSubscriptions, {
    fields: [billingPayments.subscriptionId],
    references: [userSubscriptions.userId],
  }),
}));

export const billingIntentsRelations = relations(billingIntents, ({ one }) => ({
  user: one(users, {
    fields: [billingIntents.userId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [billingIntents.planId],
    references: [plans.id],
  }),
  subscription: one(userSubscriptions, {
    fields: [billingIntents.subscriptionId],
    references: [userSubscriptions.userId],
  }),
}));

export const subscriptionChangeRequestsRelations = relations(subscriptionChangeRequests, ({ one }) => ({
  user: one(users, {
    fields: [subscriptionChangeRequests.userId],
    references: [users.id],
  }),
  fromSubscription: one(userSubscriptions, {
    fields: [subscriptionChangeRequests.fromSubscriptionId],
    references: [userSubscriptions.userId],
  }),
  toPlan: one(plans, {
    fields: [subscriptionChangeRequests.toPlanId],
    references: [plans.id],
  }),
}));

export const quotaUsageEventsRelations = relations(quotaUsageEvents, ({ one }) => ({
  user: one(users, {
    fields: [quotaUsageEvents.userId],
    references: [users.id],
  }),
}));

export const quotaAdjustmentsRelations = relations(quotaAdjustments, ({ one }) => ({
  user: one(users, {
    fields: [quotaAdjustments.userId],
    references: [users.id],
  }),
}));
