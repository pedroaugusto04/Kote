import { pgEnum } from 'drizzle-orm/pg-core';

// Core Enums
export const noteStatusEnum = pgEnum('note_status_enum', ['active', 'pending', 'resolved', 'archived', 'sent', 'overdue']);
export const askConfidenceEnum = pgEnum('ask_confidence_enum', ['low', 'medium', 'high']);
export const credentialStatusEnum = pgEnum('credential_status_enum', ['connected', 'revoked']);
export const noteCommitLinkSourceEnum = pgEnum('kb_note_commit_link_source_enum', ['ai_terminal', 'session_files', 'github_push', 'manual', 'working_tree']);

// Enum value types for type-safe inserts and updates
export type NoteStatus = typeof noteStatusEnum.enumValues[number];
export type AskConfidence = typeof askConfidenceEnum.enumValues[number];
export type CredentialStatus = typeof credentialStatusEnum.enumValues[number];
export type NoteCommitLinkSource = typeof noteCommitLinkSourceEnum.enumValues[number];

// Billing Enums
export const paymentGatewayEnum = pgEnum('kb_payment_gateway_enum', ['asaas', 'stripe']);
export const billingCycleEnum = pgEnum('kb_billing_cycle_enum', ['monthly', 'yearly']);
export const billingTypeEnum = pgEnum('kb_billing_type_enum', ['boleto', 'pix', 'credit_card']);
export const paymentStatusEnum = pgEnum('kb_payment_status_enum', ['pending', 'received', 'confirmed', 'overdue', 'refunded', 'canceled', 'partially_refunded']);
export const billingIntentTypeEnum = pgEnum('kb_billing_intent_type_enum', ['new', 'upgrade', 'change_cycle']);
export const billingIntentStatusEnum = pgEnum('kb_billing_intent_status_enum', ['pending', 'processing', 'done', 'failed', 'canceled']);
export const webhookProcessStatusEnum = pgEnum('kb_webhook_process_status_enum', ['pending', 'processing', 'done', 'failed']);
export const subscriptionChangeStatusEnum = pgEnum('kb_subscription_change_status_enum', ['scheduled', 'applied', 'canceled']);
export const subscriptionChangeTypeEnum = pgEnum('kb_subscription_change_type_enum', ['downgrade', 'change_cycle']);
export const paymentKindEnum = pgEnum('kb_payment_kind_enum', ['recurring', 'upgrade']);

export type PaymentGateway = typeof paymentGatewayEnum.enumValues[number];
export type BillingCycle = typeof billingCycleEnum.enumValues[number];
export type BillingType = typeof billingTypeEnum.enumValues[number];
export type PaymentStatus = typeof paymentStatusEnum.enumValues[number];
export type BillingIntentType = typeof billingIntentTypeEnum.enumValues[number];
export type BillingIntentStatus = typeof billingIntentStatusEnum.enumValues[number];
export type WebhookProcessStatus = typeof webhookProcessStatusEnum.enumValues[number];
export type SubscriptionChangeStatus = typeof subscriptionChangeStatusEnum.enumValues[number];
export type SubscriptionChangeType = typeof subscriptionChangeTypeEnum.enumValues[number];
export type PaymentKind = typeof paymentKindEnum.enumValues[number];

// Dependency Watch Enums
export const dependencyEcosystemEnum = pgEnum('dependency_ecosystem', ['npm', 'pip', 'composer', 'cargo', 'maven', 'gradle', 'go', 'nuget', 'rubygems']);
export const dependencyUrgencyEnum = pgEnum('dependency_urgency', ['optional', 'recommended', 'critical']);
