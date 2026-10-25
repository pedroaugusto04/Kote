import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { eq, and, or, isNull, lte, inArray, ne, desc } from 'drizzle-orm';

import { BillingPaymentRepository } from '../../../application/ports/billing/billing-repositories.js';
import type { BillingPaymentRecord } from '../../../application/models/billing.models.js';
import { PostgresDatabase } from '../../persistence/database.js';
import {
  billingPayments,
  type PaymentGateway,
  type PaymentStatus as SchemaPaymentStatus,
} from '../../persistence/schema/index.js';
import { PaymentStatus } from '../../../domain/enums/billing.enums.js';
import { pickHighestPriorityPendingPayment } from '../../../domain/utils/payment.utils.js';

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
