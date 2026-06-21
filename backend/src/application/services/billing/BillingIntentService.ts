import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import crypto from 'node:crypto';
import { PostgresDatabase } from '../../../infrastructure/persistence/database.js';
import { billingIntents } from '../../../infrastructure/persistence/schema/index.js';
import { BillingCycle } from '../../../domain/enums/billing.enums.js';

// Constants for Billing Intent Statuses
export const INTENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  DONE: 'done',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const;

@Injectable()
export class BillingIntentService {
  constructor(
    private readonly database: PostgresDatabase,
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

  async createIntentAndExternalReference(params: {
    type: 'new' | 'upgrade';
    userId: string;
    planId: string;
    billingCycle: BillingCycle;
    subscriptionId?: string;
    creditCardToken?: string | null;
  }): Promise<{ externalReference: string }> {
    const db = this.database.getDb();
    const intentId = crypto.randomUUID();
    
    await db.insert(billingIntents).values({
      id: intentId,
      type: params.type === 'new' ? 'new' : 'upgrade',
      status: INTENT_STATUS.PENDING,
      userId: params.userId,
      planId: params.planId,
      subscriptionId: params.subscriptionId || null,
      billingCycle: params.billingCycle,
      creditCardToken: params.creditCardToken || null,
    });

    const externalReference = `id=${intentId}`;
    return { externalReference };
  }

  async claimForProcessing(userId: string, intentId: string): Promise<boolean> {
    const db = this.database.getDb();

    // Claim pattern: verifica se o intent está PENDING e marca como PROCESSING de forma atômica
    const result = await db
      .update(billingIntents)
      .set({ status: INTENT_STATUS.PROCESSING, updatedAt: new Date() })
      .where(and(
        eq(billingIntents.id, intentId),
        eq(billingIntents.userId, userId),
        eq(billingIntents.status, INTENT_STATUS.PENDING)
      ))
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

  async cancelLatestPendingOneShotIntent(userId: string) {
    const db = this.database.getDb();
    await db
      .update(billingIntents)
      .set({ status: INTENT_STATUS.CANCELED, updatedAt: new Date() })
      .where(and(
        eq(billingIntents.userId, userId),
        eq(billingIntents.status, INTENT_STATUS.PENDING),
      ));
  }
}
