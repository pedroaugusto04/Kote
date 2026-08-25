import crypto from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, or, isNull, lte, lt, sql, inArray, ne, desc } from 'drizzle-orm';

import {
  BillingCustomerRepository,
  BillingPaymentRepository,
  BillingWebhookEventRepository,
  SubscriptionRepository,
  BillingIntentRepository,
} from '../../application/ports/billing/billing-repositories.js';
import {
  type BillingCustomerRecord,
  type BillingPaymentRecord,
  type GatewayWebhookEventRecord,
  type WebhookEventCreateParams,
  type WebhookEventCreateResult,
  type PlanRecord,
  type UserSubscriptionRecord,
  type SubscriptionChangeRequestRecord,
} from '../../application/models/billing.models.js';
import { PostgresDatabase } from '../persistence/database.js';
import {
  billingCustomers,
  billingPayments,
  gatewayWebhookEvents,
  plans,
  userSubscriptions,
  subscriptionChangeRequests,
  billingIntents,
  PaymentGateway,
  PaymentStatus as SchemaPaymentStatus,
  BillingType,
  PaymentKind,
} from '../persistence/schema/index.js';
import { PaymentStatus } from '../../domain/enums/billing.enums.js';
import {
  pickHighestPriorityPendingPayment,
} from '../utils/billing/paymentUtils.js';

@Injectable()
export class PostgresBillingCustomerRepository extends BillingCustomerRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async getCustomerByGatewayId(gateway: PaymentGateway, gatewayCustomerId: string): Promise<BillingCustomerRecord | null> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(billingCustomers)
      .where(
        and(
          eq(billingCustomers.gateway, gateway),
          eq(billingCustomers.gatewayCustomerId, gatewayCustomerId)
        )
      )
      .limit(1);

    if (result.length === 0) return null;
    return result[0];
  }

  async getCustomerByUserId(userId: string, gateway: PaymentGateway): Promise<BillingCustomerRecord | null> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(billingCustomers)
      .where(
        and(
          eq(billingCustomers.userId, userId),
          eq(billingCustomers.gateway, gateway)
        )
      )
      .limit(1);

    if (result.length === 0) return null;
    return result[0];
  }

  async getCreditCardToken(userId: string, gateway: PaymentGateway): Promise<string | null> {
    const customer = await this.getCustomerByUserId(userId, gateway);
    return customer?.creditCardToken ?? null;
  }

  async markCreditCardOnFile(userId: string, gateway: PaymentGateway, token: string): Promise<void> {
    const db = this.database.getDb();
    await db
      .update(billingCustomers)
      .set({
        hasCreditCardOnFile: true,
        creditCardToken: token,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(billingCustomers.userId, userId),
          eq(billingCustomers.gateway, gateway)
        )
      );
  }

  async getGatewayCustomerId(userId: string, gateway: PaymentGateway): Promise<string> {
    const customer = await this.getCustomerByUserId(userId, gateway);
    if (!customer?.gatewayCustomerId) {
      throw new NotFoundException('gateway_customer_not_found');
    }
    return customer.gatewayCustomerId;
  }

  async upsertCustomer(userId: string, gateway: PaymentGateway, gatewayCustomerId: string): Promise<BillingCustomerRecord> {
    const db = this.database.getDb();
    const result = await db
      .insert(billingCustomers)
      .values({
        id: crypto.randomUUID(),
        userId,
        gateway,
        gatewayCustomerId,
        hasCreditCardOnFile: false,
      })
      .onConflictDoUpdate({
        target: [billingCustomers.userId, billingCustomers.gateway],
        set: {
          gatewayCustomerId,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  }
}

@Injectable()
export class PostgresBillingPaymentRepository extends BillingPaymentRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async getSubscriptionPaymentByGatewayPaymentId(gateway: PaymentGateway, gatewayPaymentId: string): Promise<BillingPaymentRecord | null> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(billingPayments)
      .where(
        and(
          eq(billingPayments.gateway, gateway),
          eq(billingPayments.gatewayPaymentId, gatewayPaymentId)
        )
      )
      .limit(1);

    if (result.length === 0) return null;

    const row = result[0];
    return {
      ...row,
      value: Number(row.value),
    };
  }

  async updateSubscriptionPaymentByGatewayId(
    gateway: PaymentGateway,
    gatewayPaymentId: string,
    data: Partial<Omit<BillingPaymentRecord, 'id' | 'createdAt' | 'updatedAt'>> & {
      onlyIfLastGatewayEventAtLte?: Date;
    }
  ): Promise<boolean> {
    const db = this.database.getDb();
    const { onlyIfLastGatewayEventAtLte, ...updateData } = data;

    const updateFields: Record<string, unknown> = {
      ...updateData,
      updatedAt: new Date(),
    };

    if (updateData.value !== undefined) {
      updateFields.value = String(updateData.value);
    }

    const whereClause = and(
      eq(billingPayments.gateway, gateway),
      eq(billingPayments.gatewayPaymentId, gatewayPaymentId),
      onlyIfLastGatewayEventAtLte
        ? or(
            isNull(billingPayments.lastGatewayEventAt),
            lte(billingPayments.lastGatewayEventAt, onlyIfLastGatewayEventAtLte)
          )
        : undefined
    );

    const result = await db
      .update(billingPayments)
      .set(updateFields)
      .where(whereClause)
      .returning();

    return result.length > 0;
  }

  async upsertSubscriptionPayment(
    data: Omit<BillingPaymentRecord, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    }
  ): Promise<BillingPaymentRecord> {
    const db = this.database.getDb();
    const result = await db
      .insert(billingPayments)
      .values({
        id: data.id || crypto.randomUUID(),
        subscriptionId: data.subscriptionId,
        userId: data.userId,
        gateway: data.gateway,
        gatewayPaymentId: data.gatewayPaymentId,
        status: data.status,
        billingType: data.billingType,
        kind: data.kind,
        gatewayStatus: data.gatewayStatus,
        value: String(data.value),
        dueDate: data.dueDate,
        paidAt: data.paidAt,
        invoiceUrl: data.invoiceUrl,
        bankSlipUrl: data.bankSlipUrl,
        pixQrCode: data.pixQrCode,
        pixQrCodeUrl: data.pixQrCodeUrl,
        description: data.description,
        stripeClientSecret: data.stripeClientSecret,
        lastGatewayEventAt: data.lastGatewayEventAt,
      })
      .onConflictDoUpdate({
        target: [billingPayments.userId, billingPayments.gateway, billingPayments.gatewayPaymentId],
        set: {
          subscriptionId: data.subscriptionId,
          status: data.status,
          billingType: data.billingType,
          kind: data.kind,
          gatewayStatus: data.gatewayStatus,
          value: String(data.value),
          dueDate: data.dueDate,
          paidAt: data.paidAt,
          invoiceUrl: data.invoiceUrl,
          bankSlipUrl: data.bankSlipUrl,
          pixQrCode: data.pixQrCode,
          pixQrCodeUrl: data.pixQrCodeUrl,
          description: data.description,
          stripeClientSecret: data.stripeClientSecret,
          lastGatewayEventAt: data.lastGatewayEventAt,
          updatedAt: new Date(),
        },
      })
      .returning();

    const row = result[0];
    return {
      ...row,
      value: Number(row.value),
    };
  }

  async getLatestPendingPaymentByUserId(userId: string): Promise<BillingPaymentRecord | null> {
    const db = this.database.getDb();
    const rows = await db
      .select()
      .from(billingPayments)
      .where(and(
        eq(billingPayments.userId, userId),
        inArray(billingPayments.status, [PaymentStatus.PENDING, PaymentStatus.OVERDUE]),
      ))
      .orderBy(desc(billingPayments.dueDate), desc(billingPayments.createdAt));

    if (rows.length === 0) {
      return null;
    }

    const selected = pickHighestPriorityPendingPayment(rows.map((row) => ({
      ...row,
      dueDate: row.dueDate,
      createdAt: row.createdAt,
    })));

    if (!selected) {
      return null;
    }

    return {
      ...selected,
      value: Number(selected.value),
    };
  }

  async hasRecurringPaymentInRealDebt(userId: string, subscriptionId: string): Promise<boolean> {
    const db = this.database.getDb();

    const overduePayment = await db
      .select({ id: billingPayments.id })
      .from(billingPayments)
      .where(and(
        eq(billingPayments.userId, userId),
        eq(billingPayments.subscriptionId, subscriptionId),
        eq(billingPayments.kind, 'recurring'),
        eq(billingPayments.status, PaymentStatus.OVERDUE),
      ))
      .limit(1);

    if (overduePayment.length > 0) {
      return true;
    }

    const latestRecurring = await db
      .select()
      .from(billingPayments)
      .where(and(
        eq(billingPayments.userId, userId),
        eq(billingPayments.subscriptionId, subscriptionId),
        eq(billingPayments.kind, 'recurring'),
        ne(billingPayments.status, PaymentStatus.CANCELED),
      ))
      .orderBy(desc(billingPayments.dueDate))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    if (
      latestRecurring &&
      (latestRecurring.status === PaymentStatus.REFUNDED ||
        latestRecurring.status === PaymentStatus.PARTIALLY_REFUNDED)
    ) {
      return true;
    }

    return false;
  }

  async getPaymentById(id: string): Promise<BillingPaymentRecord | null> {
    const db = this.database.getDb();
    const result = await db.select().from(billingPayments).where(eq(billingPayments.id, id)).limit(1);
    return (result[0] as unknown as BillingPaymentRecord) || null;
  }

  async getOpenPaymentsByUserId(userId: string): Promise<BillingPaymentRecord[]> {
    const db = this.database.getDb();
    const result = await db.select().from(billingPayments).where(and(
      eq(billingPayments.userId, userId),
      inArray(billingPayments.status, ['pending', 'overdue'])
    ));
    return result as unknown as BillingPaymentRecord[];
  }

  async updatePaymentStatus(id: string, status: string): Promise<void> {
    const db = this.database.getDb();
    await db.update(billingPayments).set({ status: status as SchemaPaymentStatus, updatedAt: new Date() }).where(eq(billingPayments.id, id));
  }
}

@Injectable()
export class PostgresBillingWebhookEventRepository extends BillingWebhookEventRepository {
  constructor(private readonly database: PostgresDatabase) {
    super();
  }

  async createWebhookEventOnce(params: WebhookEventCreateParams): Promise<WebhookEventCreateResult> {
    const db = this.database.getDb();
    try {
      const result = await db
        .insert(gatewayWebhookEvents)
        .values({
          id: crypto.randomUUID(),
          gateway: params.gateway,
          dedupKey: params.dedupKey,
          eventType: params.eventType,
          gatewayEventId: params.gatewayEventId,
          gatewayPaymentId: params.gatewayPaymentId,
          gatewaySubscriptionId: params.gatewaySubscriptionId,
          payload: params.payload,
          status: 'pending',
          attempts: 0,
        })
        .returning();
      
      const row = result[0];
      return {
        id: row.id,
        created: true,
        status: row.status as 'pending' | 'processing' | 'done' | 'failed',
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes('unique constraint') || (err && typeof err === 'object' && 'code' in err && err.code === '23505')) {
        const existing = await db
          .select({
            id: gatewayWebhookEvents.id,
            status: gatewayWebhookEvents.status,
          })
          .from(gatewayWebhookEvents)
          .where(
            and(
              eq(gatewayWebhookEvents.gateway, params.gateway),
              eq(gatewayWebhookEvents.dedupKey, params.dedupKey)
            )
          )
          .limit(1);
        
        if (existing.length > 0) {
          return {
            id: existing[0].id,
            created: false,
            status: existing[0].status as 'pending' | 'processing' | 'done' | 'failed',
          };
        }
      }
      throw err;
    }
  }

  async getWebhookEventById(id: string): Promise<GatewayWebhookEventRecord | null> {
    const db = this.database.getDb();
    const result = await db
      .select()
      .from(gatewayWebhookEvents)
      .where(eq(gatewayWebhookEvents.id, id))
      .limit(1);

    if (result.length === 0) return null;
    return {
      ...result[0],
      payload: (result[0].payload || {}) as Record<string, unknown>,
    };
  }

  async markWebhookEventProcessing(id: string, maxAttempts: number): Promise<boolean> {
    const db = this.database.getDb();
    const result = await db
      .update(gatewayWebhookEvents)
      .set({
        status: 'processing',
        attempts: sql`${gatewayWebhookEvents.attempts} + 1`,
        lastDispatchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(gatewayWebhookEvents.id, id),
          or(
            eq(gatewayWebhookEvents.status, 'pending'),
            eq(gatewayWebhookEvents.status, 'failed')
          ),
          lt(gatewayWebhookEvents.attempts, maxAttempts)
        )
      )
      .returning();

    return result.length > 0;
  }

  async markWebhookEventDone(id: string): Promise<void> {
    const db = this.database.getDb();
    await db
      .update(gatewayWebhookEvents)
      .set({
        status: 'done',
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(gatewayWebhookEvents.id, id));
  }

  async markWebhookEventFailed(id: string, error: string): Promise<void> {
    const db = this.database.getDb();
    await db
      .update(gatewayWebhookEvents)
      .set({
        status: 'failed',
        lastError: error,
        updatedAt: new Date(),
      })
      .where(eq(gatewayWebhookEvents.id, id));
  }

  async markWebhookEventAlerted(id: string, alertMarker: string): Promise<void> {
    const db = this.database.getDb();
    await db
      .update(gatewayWebhookEvents)
      .set({
        lastError: sql`concat(${gatewayWebhookEvents.lastError}, ' ', ${alertMarker})`,
        updatedAt: new Date(),
      })
      .where(eq(gatewayWebhookEvents.id, id));
  }
}

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
}

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
