import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { eq, and, or, isNull, gt, gte, lte, sum, count } from 'drizzle-orm';

import { QuotaRepository } from '../../application/ports/quota/quota.repository.js';
import type {
  PlanRecord,
  UserSubscriptionWithPlan,
  QuotaAdjustmentRecord,
  SaveQuotaUsageEventInput,
} from '../../application/models/repository-records.models.js';
import { PostgresDatabase } from '../persistence/database.js';
import {
  plans,
  userSubscriptions,
  quotaUsageEvents,
  quotaAdjustments,
  attachments,
  workspaces,
  projects,
  notes,
} from '../persistence/schema/index.js';
import {
  planFromRow,
  quotaAdjustmentFromRow,
} from '../mappers/row.mappers.js';

@Injectable()
export class PostgresQuotaRepository extends QuotaRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async getSubscription(userId: string): Promise<UserSubscriptionWithPlan | null> {
    const db = this.database.getDb();
    const result = await db
      .select({
        userId: userSubscriptions.userId,
        planId: userSubscriptions.planId,
        status: userSubscriptions.status,
        currentPeriodStart: userSubscriptions.currentPeriodStart,
        currentPeriodEnd: userSubscriptions.currentPeriodEnd,
        gatewayName: userSubscriptions.gatewayName,
        gatewaySubscriptionId: userSubscriptions.gatewaySubscriptionId,
        gatewayCustomerId: userSubscriptions.gatewayCustomerId,
        createdAt: userSubscriptions.createdAt,
        updatedAt: userSubscriptions.updatedAt,
        // plan fields
        plan_id: plans.id,
        plan_slug: plans.slug,
        plan_display_name: plans.displayName,
        plan_description: plans.description,
        plan_max_storage_bytes: plans.maxStorageBytes,
        plan_max_ai_credits_per_month: plans.maxAiCreditsPerMonth,
        plan_max_workspaces: plans.maxWorkspaces,
        plan_max_projects_per_workspace: plans.maxProjectsPerWorkspace,
        plan_price_cents: plans.priceCents,
        plan_billing_period: plans.billingPeriod,
        plan_is_active: plans.isActive,
        plan_created_at: plans.createdAt,
        plan_updated_at: plans.updatedAt,
      })
      .from(userSubscriptions)
      .innerJoin(plans, eq(userSubscriptions.planId, plans.id))
      .where(eq(userSubscriptions.userId, userId))
      .limit(1);

    if (result.length === 0) return null;

    const row = result[0];
    return {
      userId: row.userId,
      planId: row.planId,
      status: row.status,
      currentPeriodStart: row.currentPeriodStart.toISOString(),
      currentPeriodEnd: row.currentPeriodEnd.toISOString(),
      gatewayName: row.gatewayName,
      gatewaySubscriptionId: row.gatewaySubscriptionId,
      gatewayCustomerId: row.gatewayCustomerId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      plan: {
        id: row.plan_id,
        slug: row.plan_slug,
        displayName: row.plan_display_name,
        description: row.plan_description,
        maxStorageBytes: Number(row.plan_max_storage_bytes),
        maxAiCreditsPerMonth: row.plan_max_ai_credits_per_month,
        maxWorkspaces: row.plan_max_workspaces,
        maxProjectsPerWorkspace: row.plan_max_projects_per_workspace,
        priceCents: row.plan_price_cents,
        billingPeriod: row.plan_billing_period,
        isActive: row.plan_is_active,
        createdAt: row.plan_created_at.toISOString(),
        updatedAt: row.plan_updated_at.toISOString(),
      },
    };
  }

  async getPlanBySlug(slug: string): Promise<PlanRecord | null> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(plans)
      .where(eq(plans.slug, slug))
      .limit(1);

    if (result.length === 0) return null;
    return planFromRow(result[0]);
  }

  async getActiveAdjustments(userId: string, type: string): Promise<QuotaAdjustmentRecord[]> {
    const db = this.database.getDb();
    const now = new Date();
    const result = await db
      .select()
      .from(quotaAdjustments)
      .where(
        and(
          eq(quotaAdjustments.userId, userId),
          eq(quotaAdjustments.type, type),
          or(
            isNull(quotaAdjustments.expiresAt),
            gt(quotaAdjustments.expiresAt, now),
          ),
        ),
      );

    return result.map(quotaAdjustmentFromRow);
  }

  async getCurrentUsage(userId: string, type: string, start: Date, end: Date): Promise<number> {
    const db = this.database.getDb();
    const result = await db
      .select({ total: sum(quotaUsageEvents.amount) })
      .from(quotaUsageEvents)
      .where(
        and(
          eq(quotaUsageEvents.userId, userId),
          eq(quotaUsageEvents.type, type),
          gte(quotaUsageEvents.createdAt, start),
          lte(quotaUsageEvents.createdAt, end),
        ),
      );

    return Number(result[0]?.total || 0);
  }

  async saveUsageEvent(input: SaveQuotaUsageEventInput): Promise<void> {
    const db = this.database.getDb();
    await db
      .insert(quotaUsageEvents)
      .values({
        id: input.id || crypto.randomUUID(),
        userId: input.userId,
        type: input.type,
        amount: input.amount ?? 1,
        description: input.description,
        metadata: input.metadata || {},
      });
  }

  async getAttachmentStorageUsage(userId: string): Promise<number> {
    const db = this.database.getDb();
    const [attachmentsResult, notesResult] = await Promise.all([
      db
        .select({ total: sum(attachments.sizeBytes) })
        .from(attachments)
        .where(eq(attachments.userId, userId)),
      db
        .select({ total: sum(notes.sizeBytes) })
        .from(notes)
        .where(eq(notes.userId, userId)),
    ]);

    const totalAttachments = Number(attachmentsResult[0]?.total || 0);
    const totalNotes = Number(notesResult[0]?.total || 0);

    return totalAttachments + totalNotes;
  }

  async getWorkspaceCount(userId: string): Promise<number> {
    const db = this.database.getDb();
    const result = await db
      .select({ total: count() })
      .from(workspaces)
      .where(eq(workspaces.userId, userId));

    return Number(result[0]?.total || 0);
  }

  async getProjectCountInWorkspace(userId: string, workspaceId: string): Promise<number> {
    const db = this.database.getDb();
    const result = await db
      .select({ total: count() })
      .from(projects)
      .where(
        and(
          eq(projects.userId, userId),
          eq(projects.workspaceId, workspaceId),
        ),
      );

    return Number(result[0]?.total || 0);
  }
}
