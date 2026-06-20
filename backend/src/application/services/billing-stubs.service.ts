import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { PostgresDatabase } from '../../infrastructure/persistence/database.js';
import {
  billingIntents,
  userSubscriptions,
  type BillingCycle,
  type BillingType,
  type BillingIntentStatus,
} from '../../infrastructure/persistence/schema/index.js';
import { AppLogger } from '../../observability/logger.js';

// Constants for User Subscription Statuses
export const USER_SUB_STATUS = {
  ACTIVE: 'active',
  TRIALING: 'trialing',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
} as const;
export type UserSubStatus = typeof USER_SUB_STATUS[keyof typeof USER_SUB_STATUS];

// Constants for Gateway Names
export const GATEWAY_NAMES = {
  ASAAS: 'asaas',
} as const;

// Constants for Billing Intent Statuses
export const INTENT_STATUS: Record<string, BillingIntentStatus> = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  DONE: 'done',
  FAILED: 'failed',
  CANCELED: 'canceled',
};

@Injectable()
export class BillingIntentService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly logger: AppLogger
  ) {}

  async resolveIntentFromExternalReference(ref?: string | null) {
    if (!ref) {
      throw new Error('externalReference is missing');
    }

    const params = new URLSearchParams(ref);
    const intentId = params.get('id');
    if (!intentId) {
      throw new Error('id not found in externalReference');
    }

    const db = this.database.getDb();
    const result = await db
      .select()
      .from(billingIntents)
      .where(eq(billingIntents.id, intentId))
      .limit(1);

    if (result.length === 0) {
      return { shouldProcess: false, intent: null };
    }

    const intent = result[0];
    const shouldProcess =
      intent.status === INTENT_STATUS.PENDING ||
      intent.status === INTENT_STATUS.PROCESSING;

    return { shouldProcess, intent };
  }

  async claimForProcessing(userId: string, intentId: string): Promise<boolean> {
    const db = this.database.getDb();
    const result = await db
      .update(billingIntents)
      .set({ status: INTENT_STATUS.PROCESSING, updatedAt: new Date() })
      .where(eq(billingIntents.id, intentId))
      .returning();

    return result.length > 0;
  }

  async markDone(userId: string, intentId: string) {
    const db = this.database.getDb();
    await db
      .update(billingIntents)
      .set({ status: INTENT_STATUS.DONE, updatedAt: new Date() })
      .where(eq(billingIntents.id, intentId));
  }

  async markDoneWithSubscription(userId: string, intentId: string, subscriptionId: string) {
    const db = this.database.getDb();
    await db
      .update(billingIntents)
      .set({ status: INTENT_STATUS.DONE, subscriptionId, updatedAt: new Date() })
      .where(eq(billingIntents.id, intentId));
  }

  async markFailed(userId: string, intentId: string) {
    const db = this.database.getDb();
    await db
      .update(billingIntents)
      .set({ status: INTENT_STATUS.FAILED, updatedAt: new Date() })
      .where(eq(billingIntents.id, intentId));
  }

  async markCanceled(userId: string, intentId: string) {
    const db = this.database.getDb();
    await db
      .update(billingIntents)
      .set({ status: INTENT_STATUS.CANCELED, updatedAt: new Date() })
      .where(eq(billingIntents.id, intentId));
  }
}

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly logger: AppLogger,
    private readonly billingIntentService: BillingIntentService
  ) {}

  async createNewSubscription(params: {
    gatewayCustomerId: string;
    userId: string;
    targetPlanId: string;
    billingCycle: BillingCycle;
    billingType?: BillingType;
    activationDate?: Date;
    creditCardToken?: string;
    createdFromIntentId?: string;
  }): Promise<{ id: string }> {
    const db = this.database.getDb();
    const currentPeriodStart = params.activationDate || new Date();
    const currentPeriodEnd = new Date(currentPeriodStart);

    if (params.billingCycle === 'yearly') {
      currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
    } else {
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    }

    const values = {
      userId: params.userId,
      planId: params.targetPlanId,
      status: USER_SUB_STATUS.ACTIVE,
      currentPeriodStart,
      currentPeriodEnd,
      gatewayName: GATEWAY_NAMES.ASAAS,
      gatewayCustomerId: params.gatewayCustomerId,
      billingCycle: params.billingCycle,
      billingType: params.billingType,
    };

    await db
      .insert(userSubscriptions)
      .values(values)
      .onConflictDoUpdate({
        target: [userSubscriptions.userId],
        set: {
          ...values,
          updatedAt: new Date(),
        },
      });

    if (params.createdFromIntentId) {
      await this.billingIntentService.markDoneWithSubscription(
        params.userId,
        params.createdFromIntentId,
        params.userId
      );
    }

    return { id: params.userId };
  }

  async confirmUpgrade(subscriptionId: string, targetPlanId: string): Promise<void> {
    const db = this.database.getDb();
    await db
      .update(userSubscriptions)
      .set({
        planId: targetPlanId,
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.userId, subscriptionId));
  }

  async refreshSubscriptionFromPayments(params: {
    subscriptionId?: string | null;
    gatewaySubscriptionId?: string | null;
    userId: string;
    status: string;
  }): Promise<void> {
    const db = this.database.getDb();
    const subId = params.subscriptionId || params.userId;

    let localStatus: UserSubStatus = USER_SUB_STATUS.ACTIVE;
    if (params.status === 'overdue') {
      localStatus = USER_SUB_STATUS.PAST_DUE;
    } else if (params.status === 'canceled') {
      localStatus = USER_SUB_STATUS.CANCELED;
    }

    await db
      .update(userSubscriptions)
      .set({
        status: localStatus,
        gatewaySubscriptionId: params.gatewaySubscriptionId,
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.userId, subId));
  }
}
