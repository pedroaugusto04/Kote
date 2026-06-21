export enum BillingCycle {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export enum BillingType {
  CREDIT_CARD = 'credit_card',
  PIX = 'pix',
  BOLETO = 'boleto',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  INACTIVE = 'inactive',
}

export enum SubscriptionChangeType {
  DOWNGRADE = 'downgrade',
  CHANGE_CYCLE = 'change_cycle',
}

export enum SubscriptionChangeStatus {
  SCHEDULED = 'scheduled',
  APPLIED = 'applied',
  CANCELED = 'canceled',
}

export enum SubscriptionChangeKind {
  NEW = 'NEW',
  UPGRADE = 'UPGRADE',
  DOWNGRADE = 'DOWNGRADE',
  CHANGE_CYCLE = 'CHANGE_CYCLE',
  NOOP = 'NOOP',
}

export enum PaymentStatus {
  PENDING = 'pending',
  RECEIVED = 'received',
  CONFIRMED = 'confirmed',
  OVERDUE = 'overdue',
  REFUNDED = 'refunded',
  CANCELED = 'canceled',
  PARTIALLY_REFUNDED = 'partially_refunded',
}

export enum BillingIntentType {
  NEW = 'new',
  UPGRADE = 'upgrade',
  CHANGE_CYCLE = 'change_cycle',
}

export enum BillingIntentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  DONE = 'done',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

export enum PaymentKind {
  RECURRING = 'recurring',
  UPGRADE = 'upgrade',
}

export enum PaymentGateway {
  ASAAS = 'asaas',
  STRIPE = 'stripe',
}

export enum WebhookProcessStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  DONE = 'done',
  FAILED = 'failed',
}

