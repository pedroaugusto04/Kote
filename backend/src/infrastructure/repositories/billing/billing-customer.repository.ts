import crypto from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';

import { BillingCustomerRepository } from '../../../application/ports/billing/billing-repositories.js';
import type { BillingCustomerRecord } from '../../../application/models/billing.models.js';
import { PostgresDatabase } from '../../persistence/database.js';
import { billingCustomers, type PaymentGateway } from '../../persistence/schema/index.js';

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
