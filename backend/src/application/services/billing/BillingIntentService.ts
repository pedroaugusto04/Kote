import { BadRequestException, Injectable } from '@nestjs/common';
import { eq, and, or } from 'drizzle-orm';
import crypto from 'node:crypto';
import { PostgresDatabase } from '../../../infrastructure/persistence/database.js';
import { billingIntents } from '../../../infrastructure/persistence/schema/index.js';
import { BillingCycle, BillingIntentStatus, BillingIntentType } from '../../../domain/enums/billing.enums.js';
import { buildExternalReference } from '../../../infrastructure/billing/gateways/asaas/AsaasHelpers.js';

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
      intent.status === BillingIntentStatus.PENDING ||
      intent.status === BillingIntentStatus.PROCESSING;

    return { shouldProcess, intent };
  }

  async createIntentAndExternalReference(params: {
    type: BillingIntentType.NEW | BillingIntentType.UPGRADE;
    userId: string;
    planId: string;
    billingCycle: BillingCycle;
    subscriptionId?: string;
    creditCardToken?: string | null;
  }): Promise<{ externalReference: string }> {
    const db = this.database.getDb();
    
    // Check for duplicate pending intents for NEW or UPGRADE types
    if (params.type === BillingIntentType.NEW || params.type === BillingIntentType.UPGRADE) {
      const pendingOneShotIntent = await db
        .select()
        .from(billingIntents)
        .where(and(
          eq(billingIntents.userId, params.userId),
          eq(billingIntents.status, BillingIntentStatus.PENDING),
        ))
        .limit(1)
        .then(r => r[0] || null);

      if (pendingOneShotIntent && (pendingOneShotIntent.type === BillingIntentType.NEW || pendingOneShotIntent.type === BillingIntentType.UPGRADE)) {
        throw new BadRequestException('There is already a pending charge awaiting payment');
      }
    }
    
    const intentId = crypto.randomUUID();

    await db.insert(billingIntents).values({
      id: intentId,
      type: params.type,
      status: BillingIntentStatus.PENDING,
      userId: params.userId,
      planId: params.planId,
      subscriptionId: params.subscriptionId || null,
      billingCycle: params.billingCycle,
      creditCardToken: params.creditCardToken || null,
    });

    const externalReference = buildExternalReference(params.type, intentId);
    return { externalReference };
  }

  async claimForProcessing(userId: string, intentId: string): Promise<boolean> {
    const db = this.database.getDb();

    // Claim pattern: verifica se o intent está PENDING e marca como PROCESSING de forma atômica
    const result = await db
      .update(billingIntents)
      .set({ status: BillingIntentStatus.PROCESSING, updatedAt: new Date() })
      .where(and(
        eq(billingIntents.id, intentId),
        eq(billingIntents.userId, userId),
        eq(billingIntents.status, BillingIntentStatus.PENDING)
      ))
      .returning();

    return result.length > 0;
  }

  async markDone(userId: string, intentId: string) {
    const db = this.database.getDb();
    await db
      .update(billingIntents)
      .set({ status: BillingIntentStatus.DONE, updatedAt: new Date() })
      .where(eq(billingIntents.id, intentId));
  }

  async markDoneWithSubscription(userId: string, intentId: string, subscriptionId: string) {
    const db = this.database.getDb();
    await db
      .update(billingIntents)
      .set({ status: BillingIntentStatus.DONE, subscriptionId, updatedAt: new Date() })
      .where(eq(billingIntents.id, intentId));
  }

  async markFailed(userId: string, intentId: string) {
    const db = this.database.getDb();
    await db
      .update(billingIntents)
      .set({ status: BillingIntentStatus.FAILED, updatedAt: new Date() })
      .where(eq(billingIntents.id, intentId));
  }

  async markCanceled(userId: string, intentId: string) {
    const db = this.database.getDb();
    await db
      .update(billingIntents)
      .set({ status: BillingIntentStatus.CANCELED, updatedAt: new Date() })
      .where(eq(billingIntents.id, intentId));
  }

  async cancelLatestPendingOneShotIntent(userId: string) {
    const db = this.database.getDb();
    await db
      .update(billingIntents)
      .set({ status: BillingIntentStatus.CANCELED, updatedAt: new Date() })
      .where(and(
        eq(billingIntents.userId, userId),
        eq(billingIntents.status, BillingIntentStatus.PENDING),
        or(
          eq(billingIntents.type, BillingIntentType.NEW),
          eq(billingIntents.type, BillingIntentType.UPGRADE)
        )
      ));
  }
}
