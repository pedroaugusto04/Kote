import { Injectable } from '@nestjs/common';
import { eq, and, lt } from 'drizzle-orm';

import { SubscriptionRepository } from '../../../application/ports/billing/billing-repositories.js';
import type {
  PlanRecord,
  UserSubscriptionRecord,
  SubscriptionChangeRequestRecord,
} from '../../../application/models/billing.models.js';
import { PostgresDatabase } from '../../persistence/database.js';
import {
  plans,
  userSubscriptions,
  subscriptionChangeRequests,
} from '../../persistence/schema/index.js';
import {
  SubscriptionStatus,
  SubscriptionChangeStatus,
  type SubscriptionChangeType,
} from '../../../domain/enums/billing.enums.js';

@Injectable()
export class PostgresSubscriptionRepository extends SubscriptionRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async getActivePlans(): Promise<PlanRecord[]> {
    const db = this.database.getDb();
    return db.select().from(plans).where(eq(plans.isActive, true)).orderBy(plans.priceCents);
  }

  async getPlanById(id: string): Promise<PlanRecord | null> {
    const db = this.database.getDb();
    const result = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
    return result[0] || null;
  }

  async getPlanBySlug(slug: string): Promise<PlanRecord | null> {
    const db = this.database.getDb();
    const result = await db.select().from(plans).where(eq(plans.slug, slug)).limit(1);
    return result[0] || null;
  }

  async getSubscriptionByUserId(userId: string): Promise<UserSubscriptionRecord | null> {
    const db = this.database.getDb();
    const result = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)).limit(1);
    return result[0] || null;
  }

  async getSubscriptionByGatewaySubscriptionId(gatewaySubscriptionId: string): Promise<UserSubscriptionRecord | null> {
    const db = this.database.getDb();
    const result = await db.select().from(userSubscriptions).where(eq(userSubscriptions.gatewaySubscriptionId, gatewaySubscriptionId)).limit(1);
    return result[0] || null;
  }

  async getSubscriptionByCreatedFromIntentId(userId: string, intentId: string): Promise<UserSubscriptionRecord | null> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(userSubscriptions)
      .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.createdFromIntentId, intentId)))
      .limit(1);
    return result[0] || null;
  }

  async upsertUserSubscription(userId: string, data: Partial<UserSubscriptionRecord>): Promise<UserSubscriptionRecord> {
    const db = this.database.getDb();
    const existing = await this.getSubscriptionByUserId(userId);
    if (existing) {
      const [updated] = await db
        .update(userSubscriptions)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(userSubscriptions.userId, userId))
        .returning();
      return updated;
    }
    const [inserted] = await db
      .insert(userSubscriptions)
      .values({
        userId,
        planId: data.planId!,
        status: data.status || 'active',
        currentPeriodStart: data.currentPeriodStart || new Date(),
        currentPeriodEnd: data.currentPeriodEnd || new Date(),
        gatewayName: data.gatewayName || 'asaas',
        gatewaySubscriptionId: data.gatewaySubscriptionId,
        billingCycle: data.billingCycle || 'monthly',
        billingType: data.billingType,
        nextDueDate: data.nextDueDate,
        startedAt: data.startedAt,
        pastDueAt: data.pastDueAt,
        canceledAt: data.canceledAt,
        createdFromIntentId: data.createdFromIntentId,
      })
      .returning();
    return inserted;
  }

  async createSubscriptionChangeRequest(data: any): Promise<any> {
    const db = this.database.getDb();
    const [inserted] = await db
      .insert(subscriptionChangeRequests)
      .values(data)
      .returning();
    return inserted;
  }

  async getScheduledChangeRequest(userId: string, type: string): Promise<SubscriptionChangeRequestRecord | null> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(subscriptionChangeRequests)
      .where(
        and(
          eq(subscriptionChangeRequests.userId, userId),
          eq(subscriptionChangeRequests.type, type as any),
          eq(subscriptionChangeRequests.status, 'scheduled')
        )
      )
      .limit(1);
    return (result[0] as SubscriptionChangeRequestRecord) || null;
  }

  async updateSubscriptionChangeRequestStatus(id: string, status: string, options?: { appliedAt?: Date; canceledAt?: Date }): Promise<void> {
    const db = this.database.getDb();
    await db
      .update(subscriptionChangeRequests)
      .set({
        status: status as any,
        ...(options?.appliedAt && { appliedAt: options.appliedAt }),
        ...(options?.canceledAt && { canceledAt: options.canceledAt }),
        updatedAt: new Date(),
      })
      .where(eq(subscriptionChangeRequests.id, id));
  }

  async findPastDueOlderThan(cutoffDate: Date, limit: number = 100): Promise<UserSubscriptionRecord[]> {
    const db = this.database.getDb();
    return db
      .select()
      .from(userSubscriptions)
      .where(and(
        eq(userSubscriptions.status, SubscriptionStatus.PAST_DUE as any),
        lt(userSubscriptions.pastDueAt, cutoffDate)
      ))
      .limit(limit);
  }

  async findScheduledChangesDue(
    type: SubscriptionChangeType,
    cutoffDate: Date,
    maxAttempts: number = 10,
    limit: number = 100,
  ): Promise<SubscriptionChangeRequestRecord[]> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(subscriptionChangeRequests)
      .where(and(
        eq(subscriptionChangeRequests.type, type as any),
        eq(subscriptionChangeRequests.status, SubscriptionChangeStatus.SCHEDULED as any),
        lt(subscriptionChangeRequests.effectiveAt, cutoffDate),
        lt(subscriptionChangeRequests.attempts, maxAttempts),
      ))
      .limit(limit);
    return result as SubscriptionChangeRequestRecord[];
  }
}
