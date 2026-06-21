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

export enum PaymentStatus {
  PENDING = 'pending',
  RECEIVED = 'received',
  CONFIRMED = 'confirmed',
  OVERDUE = 'overdue',
  REFUNDED = 'refunded',
  CANCELED = 'canceled',
  PARTIALLY_REFUNDED = 'partially_refunded',
}
