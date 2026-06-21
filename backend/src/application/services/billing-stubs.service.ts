import { Injectable, BadRequestException } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'node:crypto';
import { PostgresDatabase } from '../../infrastructure/persistence/database.js';
import {
  plans,
  users,
  billingIntents,
  userSubscriptions,
  billingPayments,
  subscriptionChangeRequests,
  billingCustomers,
} from '../../infrastructure/persistence/schema/index.js';
import { AppLogger } from '../../observability/logger.js';
import { AsaasPaymentGateway } from '../../infrastructure/billing/gateways/asaas/AsaasPaymentGateway.js';
import { StripePaymentGateway } from '../../infrastructure/billing/gateways/stripe/StripePaymentGateway.js';
import { AsaasGatewayStatusMapper } from '../../infrastructure/billing/gateways/asaas/AsaasGatewayStatusMapper.js';
import { StripeGatewayStatusMapper } from '../../infrastructure/billing/gateways/stripe/StripeGatewayStatusMapper.js';
import { BillingTypeEnum } from '../../infrastructure/billing/gateways/IPaymentGateway.js';
import {
  BillingCycle,
  BillingType,
  SubscriptionStatus,
  SubscriptionChangeType,
  SubscriptionChangeStatus,
  PaymentStatus,
} from '../../domain/enums/billing.enums.js';
import { FREE_PLAN_ID } from '../../domain/enums/plans.enums.js';
import { PAYMENT_GATEWAY, COUNTRY_CODE } from '../../domain/constants/billing.constants.js';


// Constants for User Subscription Statuses
export const USER_SUB_STATUS = {
  ACTIVE: 'active',
  TRIALING: 'trialing',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
} as const;
export type UserSubStatus = typeof USER_SUB_STATUS[keyof typeof USER_SUB_STATUS];

// Constants for Gateway Names
export const GATEWAY_NAMES = {
  ASAAS: 'asaas',
  STRIPE: 'stripe',
} as const;

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
    private readonly logger: AppLogger
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

  async claimForProcessing(userId: string, intentId: string): Promise<boolean> {
    const db = this.database.getDb();
    const result = await db
      .update(billingIntents)
      .set({ status: INTENT_STATUS.PROCESSING, updatedAt: new Date() })
      .where(eq(billingIntents.id, intentId))
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
}

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly logger: AppLogger,
    private readonly billingIntentService: BillingIntentService,
    private readonly asaasPaymentGateway: AsaasPaymentGateway,
    private readonly stripePaymentGateway: StripePaymentGateway,
    private readonly asaasGatewayStatusMapper: AsaasGatewayStatusMapper,
    private readonly stripeGatewayStatusMapper: StripeGatewayStatusMapper,
  ) {}

  async getPlans() {
    const db = this.database.getDb();
    const activePlans = await db.select().from(plans).where(eq(plans.isActive, true));
    return activePlans.map(plan => ({
      id: plan.id,
      name: plan.displayName,
      description: plan.description,
      price: plan.priceCents / 100,
      annualPrice: (plan.priceCents * 12 * 0.8) / 100, // 20% discount for annual
      priceUsd: plan.priceUsdCents / 100,
      annualPriceUsd: (plan.priceUsdCents * 12 * 0.8) / 100, // 20% discount for annual
      maxStorageBytes: Number(plan.maxStorageBytes),
      maxAiRequestsPerMonth: plan.maxAiRequestsPerMonth,
      maxWorkspaces: plan.maxWorkspaces,
      maxProjectsPerWorkspace: plan.maxProjectsPerWorkspace,
      isDefault: plan.slug === 'free',
      isVisible: plan.isActive,
    }));
  }

  async registerOrUpdateSubscription(
    userId: string,
    userEmail: string,
    userDisplayName: string | null,
    planId: string,
    billingCycle?: BillingCycle,
    billingType?: BillingType,
    cpfCnpj?: string,
    countryCode?: string,
  ) {
    const db = this.database.getDb();

    const targetPlan = await db.select().from(plans).where(eq(plans.id, planId)).limit(1).then(r => r[0] || null);
    if (!targetPlan) {
      throw new BadRequestException('Plan not found');
    }

    const currentSub = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)).limit(1).then(r => r[0] || null);

    // Fetch user's cpfCnpj if not provided
    if (!cpfCnpj) {
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] || null);
      cpfCnpj = user?.cpfCnpj || '';
    }

    // Save cpfCnpj to user profile if provided and different from current
    if (cpfCnpj) {
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] || null);
      if (user && user.cpfCnpj !== cpfCnpj) {
        await db.update(users).set({ cpfCnpj, updatedAt: new Date() }).where(eq(users.id, userId));
      }
    }

    if (targetPlan.slug === 'free') {
      if (currentSub && currentSub.status !== SubscriptionStatus.CANCELED) {
        const changeRequest = {
          id: crypto.randomUUID(),
          userId,
          fromSubscriptionId: userId,
          fromGateway: currentSub.gatewayName as any,
          fromGatewaySubscriptionId: currentSub.gatewaySubscriptionId || 'local-stub',
          toPlanId: targetPlan.id,
          toBillingCycle: BillingCycle.MONTHLY as any,
          toBillingType: BillingType.CREDIT_CARD as any,
          type: SubscriptionChangeType.DOWNGRADE as any,
          status: SubscriptionChangeStatus.SCHEDULED as any,
          effectiveAt: currentSub.currentPeriodEnd,
        };
        await db.insert(subscriptionChangeRequests).values(changeRequest);
      } else {
        await db.insert(userSubscriptions).values({
          userId,
          planId: targetPlan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          billingCycle: BillingCycle.MONTHLY,
        }).onConflictDoUpdate({
          target: [userSubscriptions.userId],
          set: {
            planId: targetPlan.id,
            status: SubscriptionStatus.ACTIVE,
            updatedAt: new Date(),
          }
        });
      }
    } else {
      const cycle = billingCycle || BillingCycle.MONTHLY;
      const type = billingType || BillingType.CREDIT_CARD;

      // Determine gateway based on country
      const isBrazil = countryCode?.toUpperCase() === COUNTRY_CODE.BRAZIL;
      const gatewayName = isBrazil ? PAYMENT_GATEWAY.ASAAS : PAYMENT_GATEWAY.STRIPE;
      const gateway = isBrazil ? this.asaasPaymentGateway : this.stripePaymentGateway;

      // Validate billing type compatibility with gateway
      if (!isBrazil && (type === BillingType.PIX || type === BillingType.BOLETO)) {
        throw new BadRequestException('PIX and Boleto payments are only available for Brazilian users. Please select Credit Card.');
      }

      if (isBrazil) {
        const hasAsaas = Boolean(process.env.ASAAS_ACCESS_TOKEN);
        if (!hasAsaas) {
          throw new BadRequestException('ASAAS_ACCESS_TOKEN is not configured on the server.');
        }
      } else {
        const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY);
        if (!hasStripe) {
          throw new BadRequestException('STRIPE_SECRET_KEY is not configured on the server.');
        }
      }

      // Proportional BRL or USD price
      const priceCents = isBrazil ? targetPlan.priceCents : targetPlan.priceUsdCents;
      const price = cycle === BillingCycle.YEARLY ? (priceCents * 12 * 0.8) / 100 : priceCents / 100;

      let gatewaySubscriptionId: string;
      const hasMatchingGateway = currentSub?.gatewayName === gatewayName;
      let gatewayCustomerId = hasMatchingGateway ? (currentSub?.gatewayCustomerId || '') : '';
      let bankSlipUrl: string | null = null;
      let pixQrCode: string | null = null;
      let pixQrCodeUrl: string | null = null;
      let invoiceUrl: string | null = null;
      let gatewayPaymentId: string | null = null;
      let paymentStatus: PaymentStatus = PaymentStatus.PENDING;

      try {
        let customerId = gatewayCustomerId;
        if (!customerId) {
          const customer = await gateway.createCustomer({
            name: userDisplayName || userEmail,
            email: userEmail,
            cpfCnpj: isBrazil ? (cpfCnpj || undefined) : undefined,
          });
          customerId = customer.id;
        }
        gatewayCustomerId = customerId;

        const nextDueDate = new Date();
        nextDueDate.setDate(nextDueDate.getDate() + 3);
        const subResult = await gateway.createSubscription({
          customerId,
          billingType: type === BillingType.PIX ? BillingTypeEnum.PIX : type === BillingType.BOLETO ? BillingTypeEnum.BOLETO : BillingTypeEnum.CREDIT_CARD,
          value: price,
          cycle: cycle === BillingCycle.YEARLY ? 'YEARLY' as any : 'MONTHLY' as any,
          nextDueDate: nextDueDate.toISOString().split('T')[0],
          description: `Subscription ${targetPlan.displayName} - ${cycle === BillingCycle.YEARLY ? 'Yearly' : 'Monthly'}`,
        });
        gatewaySubscriptionId = subResult.id;

        const payments = await gateway.getSubscriptionPayments(subResult.id);
        if (payments.length > 0) {
          const latest = payments[0];
          bankSlipUrl = latest.bankSlipUrl || null;
          pixQrCode = latest.pixQrCode || null;
          pixQrCodeUrl = latest.pixQrCodeUrl || null;
          invoiceUrl = latest.invoiceUrl || null;
          gatewayPaymentId = latest.id || null;
          
          // Normalize payment status from gateway using appropriate mapper (like feconect does)
          const mapper = gatewayName === PAYMENT_GATEWAY.ASAAS 
            ? this.asaasGatewayStatusMapper 
            : this.stripeGatewayStatusMapper;
          const normalizedStatus = mapper.normalizePaymentStatus(latest.status, null);
          
          if (normalizedStatus === 'confirmed' || normalizedStatus === 'received') {
            paymentStatus = PaymentStatus.CONFIRMED;
          } else {
            paymentStatus = PaymentStatus.PENDING;
          }
        }
      } catch (e: any) {
        this.logger.error(`Failed to register subscription on ${gatewayName.toUpperCase()}: ${e.message}`);
        throw new BadRequestException(`${gatewayName.toUpperCase()} subscription registration failed: ${e.message}`);
      }

      const currentPeriodStart = new Date();
      const currentPeriodEnd = new Date();
      if (cycle === BillingCycle.YEARLY) {
        currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
      } else {
        currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
      }

      // Use payment status to determine subscription status (like feconect does)
      const subscriptionStatus = paymentStatus === PaymentStatus.CONFIRMED ? SubscriptionStatus.ACTIVE : SubscriptionStatus.PENDING;

      await db.insert(userSubscriptions).values({
        userId,
        planId: targetPlan.id,
        status: subscriptionStatus,
        currentPeriodStart,
        currentPeriodEnd,
        gatewayName,
        gatewaySubscriptionId,
        gatewayCustomerId,
        billingCycle: cycle,
        billingType: type,
        nextDueDate: currentPeriodEnd,
      }).onConflictDoUpdate({
        target: [userSubscriptions.userId],
        set: {
          planId: targetPlan.id,
          status: subscriptionStatus,
          currentPeriodStart,
          currentPeriodEnd,
          gatewaySubscriptionId,
          gatewayCustomerId,
          gatewayName,
          billingCycle: cycle,
          billingType: type,
          nextDueDate: currentPeriodEnd,
          updatedAt: new Date(),
        }
      });

      const paymentId = crypto.randomUUID();
      
      // Only create payment record if we have a valid gateway payment ID
      if (!gatewayPaymentId) {
        this.logger.warn('billing_stubs.no_gateway_payment_id', {
          userId,
          gatewayName,
        });
        return;
      }
      
      await db.insert(billingPayments).values({
        id: paymentId,
        subscriptionId: userId,
        userId,
        gateway: gatewayName as any,
        gatewayPaymentId,
        status: type === BillingType.CREDIT_CARD ? PaymentStatus.CONFIRMED : PaymentStatus.PENDING,
        billingType: type,
        kind: 'recurring',
        value: String(price),
        dueDate: currentPeriodEnd,
        bankSlipUrl,
        pixQrCode,
        pixQrCodeUrl,
        invoiceUrl,
      });
    }
  }

  async cancelPendingPayment(userId: string, paymentId: string) {
    const db = this.database.getDb();
    await db.update(billingPayments).set({ status: PaymentStatus.CANCELED }).where(eq(billingPayments.id, paymentId));
    await db.update(userSubscriptions).set({ status: SubscriptionStatus.CANCELED }).where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, SubscriptionStatus.PENDING)));
  }

  async cancelScheduledChange(userId: string, changeId: string) {
    const db = this.database.getDb();
    await db.update(subscriptionChangeRequests).set({ status: SubscriptionChangeStatus.CANCELED }).where(eq(subscriptionChangeRequests.id, changeId));
  }

  async getSubscriptionStatusSummary(userId: string) {
    const db = this.database.getDb();
    
    const subRow = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)).limit(1).then(r => r[0] || null);
    
    const latestSubSummary = subRow ? {
      userId: subRow.userId,
      planId: subRow.planId,
      status: subRow.status,
      currentPeriodStart: subRow.currentPeriodStart.toISOString(),
      currentPeriodEnd: subRow.currentPeriodEnd.toISOString(),
      billingCycle: subRow.billingCycle,
      billingType: subRow.billingType,
      nextDueDate: subRow.nextDueDate ? subRow.nextDueDate.toISOString() : null,
    } : {
      userId,
      planId: FREE_PLAN_ID,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
      currentPeriodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
      billingCycle: BillingCycle.MONTHLY,
      billingType: null,
      nextDueDate: null,
    };

    const activeSubSummary = (subRow && (subRow.status === SubscriptionStatus.ACTIVE || subRow.status === SubscriptionStatus.PAST_DUE || subRow.status === SubscriptionStatus.TRIALING)) ? latestSubSummary : null;

    const paymentRow = await db
      .select()
      .from(billingPayments)
      .where(and(eq(billingPayments.userId, userId), eq(billingPayments.status, PaymentStatus.PENDING)))
      .orderBy(desc(billingPayments.createdAt))
      .limit(1)
      .then(r => r[0] || null);

    const latestPendingPaymentSummary = paymentRow ? {
      id: paymentRow.id,
      subscriptionId: paymentRow.subscriptionId,
      userId: paymentRow.userId,
      gateway: paymentRow.gateway,
      gatewayPaymentId: paymentRow.gatewayPaymentId,
      status: paymentRow.status,
      billingType: paymentRow.billingType,
      kind: paymentRow.kind,
      value: Number(paymentRow.value),
      dueDate: paymentRow.dueDate.toISOString(),
      bankSlipUrl: paymentRow.bankSlipUrl,
      pixQrCode: paymentRow.pixQrCode,
      pixQrCodeUrl: paymentRow.pixQrCodeUrl,
      invoiceUrl: paymentRow.invoiceUrl,
      canCancel: true,
    } : null;

    const changeRow = await db
      .select()
      .from(subscriptionChangeRequests)
      .where(and(eq(subscriptionChangeRequests.userId, userId), eq(subscriptionChangeRequests.status, SubscriptionChangeStatus.SCHEDULED)))
      .orderBy(desc(subscriptionChangeRequests.createdAt))
      .limit(1)
      .then(r => r[0] || null);

    const scheduledChangeDTO = changeRow ? {
      id: changeRow.id,
      userId: changeRow.userId,
      fromSubscriptionId: changeRow.fromSubscriptionId,
      toPlanId: changeRow.toPlanId,
      toBillingCycle: changeRow.toBillingCycle,
      toBillingType: changeRow.toBillingType,
      type: changeRow.type,
      status: changeRow.status,
      effectiveAt: changeRow.effectiveAt.toISOString(),
    } : null;

    const customerRow = await db.select().from(billingCustomers).where(eq(billingCustomers.userId, userId)).limit(1).then(r => r[0] || null);
    const hasCreditCardOnFile = Boolean(customerRow?.hasCreditCardOnFile);

    return {
      latestSub: latestSubSummary,
      activeSub: activeSubSummary,
      latestPendingPayment: latestPendingPaymentSummary,
      scheduledChange: scheduledChangeDTO,
      entitledPlanId: activeSubSummary ? activeSubSummary.planId : FREE_PLAN_ID,
      entitledUntil: activeSubSummary ? activeSubSummary.currentPeriodEnd : null,
      hasCreditCardOnFile,
    };
  }

  async createNewSubscription(params: {
    gatewayCustomerId: string;
    userId: string;
    targetPlanId: string;
    billingCycle: BillingCycle;
    billingType?: BillingType;
    activationDate?: Date;
    creditCardToken?: string;
    createdFromIntentId?: string;
  }): Promise<{ id: string }> {
    const db = this.database.getDb();
    const currentPeriodStart = params.activationDate || new Date();
    const currentPeriodEnd = new Date(currentPeriodStart);

    if (params.billingCycle === BillingCycle.YEARLY) {
      currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
    } else {
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    }

    const values = {
      userId: params.userId,
      planId: params.targetPlanId,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart,
      currentPeriodEnd,
      gatewayName: GATEWAY_NAMES.ASAAS,
      gatewayCustomerId: params.gatewayCustomerId,
      billingCycle: params.billingCycle,
      billingType: params.billingType,
    };

    await db
      .insert(userSubscriptions)
      .values(values)
      .onConflictDoUpdate({
        target: [userSubscriptions.userId],
        set: {
          ...values,
          updatedAt: new Date(),
        },
      });

    if (params.createdFromIntentId) {
      await this.billingIntentService.markDoneWithSubscription(
        params.userId,
        params.createdFromIntentId,
        params.userId
      );
    }

    return { id: params.userId };
  }

  async confirmUpgrade(subscriptionId: string, targetPlanId: string): Promise<void> {
    const db = this.database.getDb();
    await db
      .update(userSubscriptions)
      .set({
        planId: targetPlanId,
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.userId, subscriptionId));
  }

  async refreshSubscriptionFromPayments(params: {
    subscriptionId?: string | null;
    gatewaySubscriptionId?: string | null;
    userId: string;
    status: string;
  }): Promise<void> {
    const db = this.database.getDb();
    const subId = params.subscriptionId || params.userId;

    let localStatus: SubscriptionStatus = SubscriptionStatus.ACTIVE;
    if (params.status === 'overdue') {
      localStatus = SubscriptionStatus.PENDING;
    } else if (params.status === 'canceled') {
      localStatus = SubscriptionStatus.CANCELED;
    }

    await db
      .update(userSubscriptions)
      .set({
        status: localStatus,
        gatewaySubscriptionId: params.gatewaySubscriptionId,
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.userId, subId));
  }
}
