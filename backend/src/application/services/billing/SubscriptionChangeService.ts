import { Injectable, BadRequestException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { PostgresDatabase } from '../../../infrastructure/persistence/database.js';
import {
  subscriptionChangeRequests,
  userSubscriptions,
  plans,
} from '../../../infrastructure/persistence/schema/index.js';
import { SubscriptionChangeStatus, SubscriptionChangeType, SubscriptionStatus, BillingCycle, BillingType } from '../../../domain/enums/billing.enums.js';
import { BillingTypeEnum } from '../../../infrastructure/billing/gateways/IPaymentGateway.js';
import { AsaasPaymentGateway } from '../../../infrastructure/billing/gateways/asaas/AsaasPaymentGateway.js';
import { StripePaymentGateway } from '../../../infrastructure/billing/gateways/stripe/StripePaymentGateway.js';
import { SubscriptionService } from './SubscriptionService.js';
import { AppLogger } from '../../../observability/logger.js';
import crypto from 'node:crypto';

@Injectable()
export class SubscriptionChangeService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly asaasPaymentGateway: AsaasPaymentGateway,
    private readonly stripePaymentGateway: StripePaymentGateway,
    private readonly subscriptionService: SubscriptionService,
    private readonly logger: AppLogger,
  ) {}

  async scheduleChange(params: {
    userId: string;
    fromSubscriptionId: string;
    fromGateway: string;
    fromGatewaySubscriptionId: string;
    toPlanId: string;
    toBillingCycle: BillingCycle;
    toBillingType: BillingType;
    type: SubscriptionChangeType;
    effectiveAt: Date;
  }): Promise<string> {
    const db = this.database.getDb();

    // Verifica se já existe mudança agendada do mesmo tipo
    const existingChange = await db.select().from(subscriptionChangeRequests).where(and(
      eq(subscriptionChangeRequests.userId, params.userId),
      eq(subscriptionChangeRequests.type, params.type as any),
      eq(subscriptionChangeRequests.status, SubscriptionChangeStatus.SCHEDULED as any)
    )).limit(1).then(r => r[0] || null);

    if (existingChange) {
      throw new BadRequestException(`${params.type === SubscriptionChangeType.DOWNGRADE ? 'Downgrade' : 'Mudança de ciclo'} já está agendado`);
    }

    const changeRequest = {
      id: crypto.randomUUID(),
      userId: params.userId,
      fromSubscriptionId: params.fromSubscriptionId,
      fromGateway: params.fromGateway as any,
      fromGatewaySubscriptionId: params.fromGatewaySubscriptionId,
      toPlanId: params.toPlanId,
      toBillingCycle: params.toBillingCycle as any,
      toBillingType: params.toBillingType as any,
      type: params.type as any,
      status: SubscriptionChangeStatus.SCHEDULED as any,
      effectiveAt: params.effectiveAt,
      attempts: 0,
    };

    await db.insert(subscriptionChangeRequests).values(changeRequest);
    return changeRequest.id;
  }

  async cancelScheduledChange(userId: string, changeId: string) {
    const db = this.database.getDb();
    await db.update(subscriptionChangeRequests).set({ status: SubscriptionChangeStatus.CANCELED }).where(eq(subscriptionChangeRequests.id, changeId));
  }

  async getScheduledChange(userId: string) {
    const db = this.database.getDb();
    return await db.select().from(subscriptionChangeRequests).where(and(
      eq(subscriptionChangeRequests.userId, userId),
      eq(subscriptionChangeRequests.status, SubscriptionChangeStatus.SCHEDULED as any)
    )).limit(1).then(r => r[0] || null);
  }

  async isChangeScheduled(userId: string, type?: SubscriptionChangeType): Promise<boolean> {
    const db = this.database.getDb();
    const conditions = [
      eq(subscriptionChangeRequests.userId, userId),
      eq(subscriptionChangeRequests.status, SubscriptionChangeStatus.SCHEDULED as any)
    ];

    if (type) {
      conditions.push(eq(subscriptionChangeRequests.type, type as any));
    }

    const existingChange = await db.select().from(subscriptionChangeRequests).where(and(...conditions)).limit(1).then(r => r[0] || null);
    return Boolean(existingChange);
  }

  async applyScheduledChange(changeId: string) {
    const db = this.database.getDb();

    const changeRequest = await db.select().from(subscriptionChangeRequests).where(eq(subscriptionChangeRequests.id, changeId)).limit(1).then(r => r[0] || null);
    if (!changeRequest) {
      throw new BadRequestException('Change request not found');
    }

    if (changeRequest.status !== SubscriptionChangeStatus.SCHEDULED) {
      throw new BadRequestException('Change request is not scheduled');
    }

    const sub = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, changeRequest.userId)).limit(1).then(r => r[0] || null);
    if (!sub) {
      throw new BadRequestException('Subscription not found');
    }

    // Verifica se é downgrade para plano free - cancela a assinatura
    const plan = await db.select().from(plans).where(eq(plans.id, changeRequest.toPlanId)).limit(1).then(r => r[0] || null);
    if (!plan) {
      throw new BadRequestException('Plan not found');
    }

    if (plan.slug === 'free') {
      // Caso seja downgrade para o plano gratuito, cancela a assinatura
      // TODO: Implementar cancelamento da assinatura no gateway
      await db.update(userSubscriptions).set({
        status: SubscriptionStatus.CANCELED,
        updatedAt: new Date(),
      }).where(eq(userSubscriptions.userId, changeRequest.userId));

      await db.update(subscriptionChangeRequests).set({
        status: SubscriptionChangeStatus.APPLIED,
        updatedAt: new Date(),
      }).where(eq(subscriptionChangeRequests.id, changeId));

      return;
    }

    // Atualiza a assinatura no gateway
    const gateway = changeRequest.fromGateway === 'stripe' ? this.stripePaymentGateway : this.asaasPaymentGateway;
    const billingCycle = (changeRequest.toBillingCycle as string) === 'yearly' ? BillingCycle.YEARLY : BillingCycle.MONTHLY;
    const targetRecurringValue = this.resolvePlanValueForCycle(plan, billingCycle);
    
    if (!sub.gatewaySubscriptionId) {
      this.logger.warn(`Assinatura ${sub.userId} não possui gatewaySubscriptionId, pulando atualização do gateway`);
    } else {
      try {
        await gateway.updateSubscription(sub.gatewaySubscriptionId, {
          value: targetRecurringValue,
          cycle: billingCycle === BillingCycle.YEARLY ? 'yearly' : 'monthly',
          billingType: changeRequest.toBillingType === BillingType.PIX ? BillingTypeEnum.PIX : changeRequest.toBillingType === BillingType.BOLETO ? BillingTypeEnum.BOLETO : BillingTypeEnum.CREDIT_CARD,
          updatePendingPayments: true,
        });

        // Sincronizar pagamentos pendentes após a mudança
        await this.subscriptionService['syncPendingRecurringPaymentsAfterUpgrade'](
          { id: sub.userId, userId: changeRequest.userId, gatewaySubscriptionId: sub.gatewaySubscriptionId, gatewayName: sub.gatewayName },
          targetRecurringValue
        );

        this.logger.info(`Assinatura ${sub.userId} atualizada no gateway para plano ${plan.id} com ciclo ${changeRequest.toBillingCycle}`);
      } catch (err: any) {
        this.logger.error(`Falha ao atualizar assinatura no gateway: ${err.message}`);
        // Continua com atualização local mesmo se falhar no gateway
      }
    }

    // Atualiza localmente
    await db.update(userSubscriptions).set({
      planId: changeRequest.toPlanId,
      billingCycle: changeRequest.toBillingCycle,
      billingType: changeRequest.toBillingType,
      updatedAt: new Date(),
    }).where(eq(userSubscriptions.userId, changeRequest.userId));

    await db.update(subscriptionChangeRequests).set({
      status: SubscriptionChangeStatus.APPLIED,
      updatedAt: new Date(),
    }).where(eq(subscriptionChangeRequests.id, changeId));
  }

  async incrementAttempts(userId: string, changeId: string) {
    const db = this.database.getDb();
    const changeRequest = await db.select().from(subscriptionChangeRequests).where(eq(subscriptionChangeRequests.id, changeId)).limit(1).then(r => r[0] || null);
    if (!changeRequest) {
      throw new BadRequestException('Change request not found');
    }

    await db.update(subscriptionChangeRequests).set({
      attempts: (changeRequest.attempts || 0) + 1,
      updatedAt: new Date(),
    }).where(eq(subscriptionChangeRequests.id, changeId));
  }

  async setApplied(userId: string, changeId: string) {
    const db = this.database.getDb();
    await db.update(subscriptionChangeRequests).set({
      status: SubscriptionChangeStatus.APPLIED,
      updatedAt: new Date(),
    }).where(eq(subscriptionChangeRequests.id, changeId));
  }

  async setCanceled(userId: string, changeId: string) {
    const db = this.database.getDb();
    await db.update(subscriptionChangeRequests).set({
      status: SubscriptionChangeStatus.CANCELED,
      updatedAt: new Date(),
    }).where(eq(subscriptionChangeRequests.id, changeId));
  }

  async deleteScheduledChange(changeId: string, userId: string): Promise<number> {
    const db = this.database.getDb();
    const result = await db.delete(subscriptionChangeRequests).where(and(
      eq(subscriptionChangeRequests.id, changeId),
      eq(subscriptionChangeRequests.userId, userId)
    )).returning();
    return result.length;
  }

  private resolvePlanValueForCycle(plan: { priceCents: number; priceUsdCents: number }, cycle: BillingCycle): number {
    if (cycle === BillingCycle.YEARLY) {
      const annualPrice = (plan.priceCents * 12 * 0.8) / 100;
      return annualPrice;
    }
    return plan.priceCents / 100;
  }
}
