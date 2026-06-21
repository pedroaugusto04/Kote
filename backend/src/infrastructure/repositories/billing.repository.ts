import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { eq, and, or, isNull, lte, lt, sql, inArray } from 'drizzle-orm';

import {
  BillingCustomerRepository,
  BillingPaymentRepository,
  BillingWebhookEventRepository,
} from '../../application/ports/billing/billing-repositories.js';
import {
  type BillingCustomerRecord,
  type BillingPaymentRecord,
  type GatewayWebhookEventRecord,
  type WebhookEventCreateParams,
  type WebhookEventCreateResult,
} from '../../application/models/billing.models.js';
import { PostgresDatabase } from '../persistence/database.js';
import {
  billingCustomers,
  billingPayments,
  gatewayWebhookEvents,
  PaymentGateway,
  PaymentStatus,
  BillingType,
  PaymentKind,
} from '../persistence/schema/index.js';

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
      throw new Error(`Gateway customer ID not registered for user ${userId}`);
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

    const updateFields: any = {
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

  async hasRecurringPaymentInRealDebt(userId: string, subscriptionId: string): Promise<boolean> {
    const db = this.database.getDb();
    const paymentsInDebt = await db
      .select()
      .from(billingPayments)
      .where(and(
        eq(billingPayments.userId, userId),
        eq(billingPayments.subscriptionId, subscriptionId),
        eq(billingPayments.kind, 'recurring'),
        // Consider both PENDING and OVERDUE as real debt
        inArray(billingPayments.status, ['pending', 'overdue'])
      ))
      .limit(1);
    
    return paymentsInDebt.length > 0;
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
    return result[0];
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
