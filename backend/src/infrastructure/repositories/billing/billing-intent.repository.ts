import { Injectable } from '@nestjs/common';
import { eq, and, or } from 'drizzle-orm';

import { BillingIntentRepository } from '../../../application/ports/billing/billing-repositories.js';
import { PostgresDatabase } from '../../persistence/database.js';
import { billingIntents } from '../../persistence/schema/index.js';

@Injectable()
export class PostgresBillingIntentRepository extends BillingIntentRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async getIntentById(intentId: string): Promise<any | null> {
    const db = this.database.getDb();
    const result = await db.select().from(billingIntents).where(eq(billingIntents.id, intentId)).limit(1);
    return result[0] || null;
  }

  async getPendingOneShotIntentByUserId(userId: string): Promise<any | null> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(billingIntents)
      .where(and(eq(billingIntents.userId, userId), eq(billingIntents.status, 'pending')))
      .limit(1);
    return result[0] || null;
  }

  async createIntent(data: any): Promise<any> {
    const db = this.database.getDb();
    const [inserted] = await db.insert(billingIntents).values(data).returning();
    return inserted;
  }

  async claimForProcessing(userId: string, intentId: string): Promise<boolean> {
    const db = this.database.getDb();
    const result = await db
      .update(billingIntents)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(and(eq(billingIntents.id, intentId), eq(billingIntents.userId, userId), eq(billingIntents.status, 'pending')))
      .returning();
    return result.length > 0;
  }

  async updateIntentStatus(intentId: string, status: string, options?: { subscriptionId?: string }): Promise<void> {
    const db = this.database.getDb();
    await db
      .update(billingIntents)
      .set({ status: status as any, ...(options?.subscriptionId && { subscriptionId: options.subscriptionId }), updatedAt: new Date() })
      .where(eq(billingIntents.id, intentId));
  }

  async cancelLatestPendingOneShotIntent(userId: string): Promise<void> {
    const db = this.database.getDb();
    await db
      .update(billingIntents)
      .set({ status: 'canceled', updatedAt: new Date() })
      .where(and(
        eq(billingIntents.userId, userId),
        eq(billingIntents.status, 'pending'),
        or(eq(billingIntents.type, 'new'), eq(billingIntents.type, 'upgrade'))
      ));
  }
}
