import { Injectable, BadRequestException } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'node:crypto';
import { PostgresDatabase } from '../../../infrastructure/persistence/database.js';
import {
  plans,
  users,
  userSubscriptions,
  billingPayments,
  billingCustomers,
  subscriptionChangeRequests,
} from '../../../infrastructure/persistence/schema/index.js';
import { AppLogger } from '../../../observability/logger.js';
import { AsaasPaymentGateway } from '../../../infrastructure/billing/gateways/asaas/AsaasPaymentGateway.js';
import { StripePaymentGateway } from '../../../infrastructure/billing/gateways/stripe/StripePaymentGateway.js';
import { AsaasGatewayStatusMapper } from '../../../infrastructure/billing/gateways/asaas/AsaasGatewayStatusMapper.js';
import { StripeGatewayStatusMapper } from '../../../infrastructure/billing/gateways/stripe/StripeGatewayStatusMapper.js';
import { BillingTypeEnum, GatewayNameEnum } from '../../../infrastructure/billing/gateways/IPaymentGateway.js';
import {
  BillingCycle,
  BillingType,
  SubscriptionStatus,
  SubscriptionChangeType,
  SubscriptionChangeStatus,
  PaymentStatus,
} from '../../../domain/enums/billing.enums.js';
import { FREE_PLAN_ID } from '../../../domain/enums/plans.enums.js';
import { PAYMENT_GATEWAY, COUNTRY_CODE } from '../../../domain/constants/billing.constants.js';
import { BillingIntentService } from './BillingIntentService.js';
import { SubscriptionUpgradeService } from './SubscriptionUpgradeService.js';
import { SubscriptionContext } from './subscriptionStrategy/subscriptionContext.js';
import { SubscriptionChangeKind } from './subscriptionStrategy/subscriptionChangeKind.js';
import { UpdateSubscriptionStrategyResult } from './subscriptionStrategy/UpdateSubscriptionStrategy.js';
import { SubscriptionChangeService } from './SubscriptionChangeService.js';
import { PostgresBillingPaymentRepository } from '../../../infrastructure/repositories/billing.repository.js';
import { UpdateSubscriptionStrategyFactory } from './subscriptionStrategy/UpdateSubscriptionStrategyFactory.js';
import { NewSubscriptionStrategy } from './subscriptionStrategy/strategies/NewSubscriptionStrategy.js';
import { UpgradeProrationStrategy } from './subscriptionStrategy/strategies/UpgradeProrationStrategy.js';
import { DowngradeStrategy } from './subscriptionStrategy/strategies/DowngradeStrategy.js';
import { ChangeCycleStrategy } from './subscriptionStrategy/strategies/ChangeCycleStrategy.js';

// Constants for Gateway Names
export const GATEWAY_NAMES = {
  ASAAS: 'asaas',
  STRIPE: 'stripe',
} as const;

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly logger: AppLogger,
    private readonly billingIntentService: BillingIntentService,
    private readonly subscriptionUpgradeService: SubscriptionUpgradeService,
    private readonly subscriptionChangeService: SubscriptionChangeService,
    private readonly asaasPaymentGateway: AsaasPaymentGateway,
    private readonly stripePaymentGateway: StripePaymentGateway,
    private readonly asaasGatewayStatusMapper: AsaasGatewayStatusMapper,
    private readonly stripeGatewayStatusMapper: StripeGatewayStatusMapper,
    private readonly billingPaymentRepository: PostgresBillingPaymentRepository,
  ) {}

  async getPlans() {
    const db = this.database.getDb();
    const activePlans = await db.select().from(plans).where(eq(plans.isActive, true));
    return activePlans.map(plan => ({
      id: plan.id,
      name: plan.displayName,
      description: plan.description,
      price: plan.priceCents / 100,
      annualPrice: (plan.priceCents * 12 * 0.8) / 100,
      priceUsd: plan.priceUsdCents / 100,
      annualPriceUsd: (plan.priceUsdCents * 12 * 0.8) / 100,
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
    if (!targetPlan.isActive) {
      throw new BadRequestException('Plano indisponível');
    }

    const currentSub = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)).limit(1).then(r => r[0] || null);

    if (!cpfCnpj) {
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] || null);
      cpfCnpj = user?.cpfCnpj || '';
    }

    if (cpfCnpj) {
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] || null);
      if (user && user.cpfCnpj !== cpfCnpj) {
        await db.update(users).set({ cpfCnpj, updatedAt: new Date() }).where(eq(users.id, userId));
      }
    }

    const cycle = billingCycle || BillingCycle.MONTHLY;
    const type = billingType || BillingType.CREDIT_CARD;

    const isBrazil = countryCode?.toUpperCase() === COUNTRY_CODE.BRAZIL;
    const gatewayName = isBrazil ? PAYMENT_GATEWAY.ASAAS : PAYMENT_GATEWAY.STRIPE;
    const gateway = isBrazil ? this.asaasPaymentGateway : this.stripePaymentGateway;

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

    if (currentSub?.status === SubscriptionStatus.PAST_DUE) {
      throw new BadRequestException('Sua assinatura está com cobrança em atraso. Regularize o pagamento pendente para alterar plano ou ciclo.');
    }

    if (currentSub) {
      const isScheduled = await this.subscriptionChangeService.isChangeScheduled(userId);
      if (isScheduled) {
        throw new BadRequestException('Já existe uma mudança de plano agendada. Aguarde ou cancele a mudança a ser aplicada para escolher um novo plano.');
      }
    }

    // Verifica se tem cartão cadastrado para mensal
    if (cycle === BillingCycle.MONTHLY && type !== BillingType.CREDIT_CARD) {
      const customerRow = await db.select().from(billingCustomers).where(eq(billingCustomers.userId, userId)).limit(1).then(r => r[0] || null);
      const hasCreditCardOnFile = Boolean(customerRow?.hasCreditCardOnFile);
      if (hasCreditCardOnFile) {
        throw new BadRequestException('Com cartão cadastrado, assinaturas mensais devem usar cartão de crédito.');
      }
    }

    // Cria gatewayCustomerId se necessário
    let gatewayCustomerId = currentSub?.gatewayCustomerId || '';
    if (!gatewayCustomerId) {
      const customer = await gateway.createCustomer({
        name: userDisplayName || userEmail,
        email: userEmail,
        cpfCnpj: isBrazil ? (cpfCnpj || undefined) : undefined,
      });
      gatewayCustomerId = customer.id;
    }

    let activePlanRow = null;
    if (currentSub) {
      activePlanRow = await db.select().from(plans).where(eq(plans.id, currentSub.planId)).limit(1).then(r => r[0] || null);
    }
    const activePlan = activePlanRow ? {
      id: activePlanRow.id,
      slug: activePlanRow.slug,
      displayName: activePlanRow.displayName,
      priceCents: activePlanRow.priceCents,
      priceUsdCents: activePlanRow.priceUsdCents,
      maxStorageBytes: Number(activePlanRow.maxStorageBytes),
      maxAiRequestsPerMonth: activePlanRow.maxAiRequestsPerMonth,
      maxWorkspaces: activePlanRow.maxWorkspaces,
      maxProjectsPerWorkspace: activePlanRow.maxProjectsPerWorkspace,
      isActive: activePlanRow.isActive,
    } : undefined;

    // Cria SubscriptionContext
    const ctx: SubscriptionContext = {
      userId,
      newSubscriptionDTO: {
        planId,
        billingCycle: cycle,
        billingType: type,
      },
      newPlan: targetPlan,
      newBillingCycle: cycle,
      newBillingType: type === BillingType.PIX ? BillingTypeEnum.PIX : type === BillingType.BOLETO ? BillingTypeEnum.BOLETO : BillingTypeEnum.CREDIT_CARD,
      newCreditCardToken: undefined,
      newSubscriptionValue: targetPlan.priceCents,
      user: {
        id: userId,
        name: userDisplayName || userEmail,
      },
      gateway: gatewayName === PAYMENT_GATEWAY.ASAAS ? GatewayNameEnum.ASAAS : GatewayNameEnum.STRIPE,
      gatewayCustomerId,
      activeSub: currentSub ? {
        id: currentSub.userId,
        planId: currentSub.planId,
        billingCycle: currentSub.billingCycle === 'monthly' ? BillingCycle.MONTHLY : BillingCycle.YEARLY,
        gatewaySubscriptionId: currentSub.gatewaySubscriptionId || '',
        nextDueDate: currentSub.nextDueDate || undefined,
        gatewayName: currentSub.gatewayName,
      } : undefined,
      activePlan,
    };

    // Usa UpdateSubscriptionStrategyFactory para obter e executar a estratégia
    const factory = new UpdateSubscriptionStrategyFactory();
    const kind = factory.getChangeKind(ctx);
    
    // Usa strategies instanciadas manualmente para quebrar dependência circular
    const strategies = {
      newStrategy: new NewSubscriptionStrategy(this),
      upgradeProrationStrategy: new UpgradeProrationStrategy(this),
      downgradeStrategy: new DowngradeStrategy(this),
      changeCycleStrategy: new ChangeCycleStrategy(this),
    };
    
    const strategy = factory.getStrategy(kind, strategies);
    const result = await strategy.execute(ctx);

    return result.summary;
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
    gatewayName?: string;
  }): Promise<{ id: string }> {
    const db = this.database.getDb();
    const gatewayName = params.gatewayName || GATEWAY_NAMES.ASAAS;
    const gateway = gatewayName === GATEWAY_NAMES.STRIPE ? this.stripePaymentGateway : this.asaasPaymentGateway;
    
    const targetPlan = await db.select().from(plans).where(eq(plans.id, params.targetPlanId)).limit(1).then(r => r[0] || null);
    if (!targetPlan) {
      throw new BadRequestException('Plan not found');
    }

    const isBrazil = gatewayName === GATEWAY_NAMES.ASAAS;
    const priceCents = isBrazil ? targetPlan.priceCents : targetPlan.priceUsdCents;
    const price = params.billingCycle === BillingCycle.YEARLY ? (priceCents * 12 * 0.8) / 100 : priceCents / 100;

    const currentPeriodStart = params.activationDate || new Date();
    const currentPeriodEnd = new Date(currentPeriodStart);

    if (params.billingCycle === BillingCycle.YEARLY) {
      currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
    } else {
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    }

    const nextDueDate = new Date(currentPeriodEnd);
    nextDueDate.setDate(nextDueDate.getDate() + 30);

    const gatewaySubscription = await gateway.createSubscription({
      customerId: params.gatewayCustomerId,
      billingType: params.billingType === BillingType.PIX ? BillingTypeEnum.PIX : params.billingType === BillingType.BOLETO ? BillingTypeEnum.BOLETO : BillingTypeEnum.CREDIT_CARD,
      value: price,
      cycle: params.billingCycle === BillingCycle.YEARLY ? 'YEARLY' as any : 'MONTHLY' as any,
      nextDueDate: nextDueDate.toISOString().split('T')[0],
      description: `Assinatura ${targetPlan.displayName}`,
      creditCardToken: params.billingType === BillingType.CREDIT_CARD ? params.creditCardToken : undefined,
    });

    const values = {
      userId: params.userId,
      planId: params.targetPlanId,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart,
      currentPeriodEnd,
      gatewayName,
      gatewaySubscriptionId: gatewaySubscription.id,
      gatewayCustomerId: params.gatewayCustomerId,
      billingCycle: params.billingCycle,
      billingType: params.billingType,
      nextDueDate,
      startedAt: new Date(),
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

    try {
      const subscriptionPayments = await gateway.getSubscriptionPayments(gatewaySubscription.id);
      const dueDateReference = currentPeriodEnd.toISOString().split('T')[0];

      const paymentMapper = gatewayName === GATEWAY_NAMES.ASAAS 
        ? this.asaasGatewayStatusMapper 
        : this.stripeGatewayStatusMapper;

      const pendingPayments = (subscriptionPayments ?? []).filter((payment) => {
        if (!payment?.id) return false;
        const normalizedStatus = paymentMapper.normalizePaymentStatus(payment.status, null);
        return normalizedStatus === PaymentStatus.PENDING;
      });

      const autoGeneratedPayment = pendingPayments.find((payment) => {
        if (!payment.dueDate) return true;
        const parsedDueDate = new Date(payment.dueDate);
        if (!parsedDueDate) return true;
        return parsedDueDate.toISOString().split('T')[0] === dueDateReference;
      }) ?? pendingPayments[0];

      if (autoGeneratedPayment?.id) {
        const safeAutoGeneratedDueDate = autoGeneratedPayment.dueDate ? new Date(autoGeneratedPayment.dueDate) : currentPeriodEnd;
        const normalizedStatus = paymentMapper.normalizePaymentStatus(autoGeneratedPayment.status, null) ?? PaymentStatus.PENDING;

        await db.insert(billingPayments).values({
          id: crypto.randomUUID(),
          subscriptionId: params.userId,
          userId: params.userId,
          gateway: gatewayName as any,
          gatewayPaymentId: autoGeneratedPayment.id,
          status: normalizedStatus,
          billingType: autoGeneratedPayment.billingType as any || params.billingType,
          gatewayStatus: autoGeneratedPayment.status ?? null,
          value: String(autoGeneratedPayment.value ?? price),
          dueDate: safeAutoGeneratedDueDate,
          paidAt: autoGeneratedPayment.paidAt ? new Date(autoGeneratedPayment.paidAt) : null,
          invoiceUrl: autoGeneratedPayment.invoiceUrl || null,
          bankSlipUrl: autoGeneratedPayment.bankSlipUrl || null,
          pixQrCode: autoGeneratedPayment.pixQrCode || null,
          pixQrCodeUrl: autoGeneratedPayment.pixQrCodeUrl || null,
          description: autoGeneratedPayment.description || null,
          kind: 'recurring',
        }).onConflictDoUpdate({
          target: [billingPayments.gatewayPaymentId],
          set: {
            status: normalizedStatus,
            dueDate: safeAutoGeneratedDueDate,
            paidAt: autoGeneratedPayment.paidAt ? new Date(autoGeneratedPayment.paidAt) : null,
            updatedAt: new Date(),
          }
        });

        this.logger.info(`Recurring payment ${autoGeneratedPayment.id} synced after subscription creation`);
      }
    } catch (err) {
      this.logger.error(`Failed to sync recurring payment after subscription creation: ${err}`);
    }

    return { id: params.userId };
  }

  async confirmUpgrade(subscriptionId: string, targetPlanId: string, gateway: string, gatewayCustomerId: string, price: number, billingType: BillingType): Promise<void> {
    const db = this.database.getDb();
    
    const sub = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, subscriptionId)).limit(1).then(r => r[0] || null);
    if (!sub) {
      throw new BadRequestException('Subscription not found');
    }

    const plan = await db.select().from(plans).where(eq(plans.id, targetPlanId)).limit(1).then(r => r[0] || null);
    if (!plan) {
      throw new BadRequestException('Plan not found');
    }

    const paymentGateway = gateway === GATEWAY_NAMES.STRIPE ? this.stripePaymentGateway : this.asaasPaymentGateway;
    const billingCycle = (sub.billingCycle as string) === 'yearly' ? BillingCycle.YEARLY : BillingCycle.MONTHLY;
    const targetRecurringValue = this.resolvePlanValueForCycle(plan, billingCycle);

    // Sincroniza o valor da assinatura no gateway para os próximos ciclos
    if (sub.gatewaySubscriptionId) {
      try {
        await paymentGateway.updateSubscription(sub.gatewaySubscriptionId, {
          value: targetRecurringValue,
          updatePendingPayments: true,
        });

        // Sincroniza pagamentos pendentes após o upgrade
        await this.subscriptionChangeService.syncPendingRecurringPaymentsAfterUpgrade(
          { id: sub.userId, userId: subscriptionId, gatewaySubscriptionId: sub.gatewaySubscriptionId, gatewayName: sub.gatewayName },
          targetRecurringValue
        );

        this.logger.info(`Assinatura ${subscriptionId} atualizada no gateway após upgrade para plano ${targetPlanId}`);
      } catch (err: any) {
        this.logger.error(`Falha ao atualizar assinatura no gateway após upgrade: ${err.message}`);
        // Continua com atualização local mesmo se falhar no gateway
      }
    }

    // Atualiza o plano da assinatura localmente
    await db
      .update(userSubscriptions)
      .set({
        planId: targetPlanId,
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.userId, subscriptionId));

    // Cria pagamento de upgrade (se price foi fornecido)
    if (price > 0) {
      const mapper = gateway === GATEWAY_NAMES.STRIPE ? this.stripeGatewayStatusMapper : this.asaasGatewayStatusMapper;
      
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1);

      const payment = await paymentGateway.createPayment({
        customerId: gatewayCustomerId,
        userId: subscriptionId,
        billingType: billingType === BillingType.PIX ? BillingTypeEnum.PIX : billingType === BillingType.BOLETO ? BillingTypeEnum.BOLETO : BillingTypeEnum.CREDIT_CARD,
        value: price,
        dueDate: dueDate.toISOString().split('T')[0],
        description: `Upgrade to plan ${targetPlanId}`,
        kind: 'upgrade' as any,
      });

      const normalizedStatus = mapper.normalizePaymentStatus(payment.status, null) ?? PaymentStatus.PENDING;

      await db.insert(billingPayments).values({
        id: crypto.randomUUID(),
        subscriptionId,
        userId: subscriptionId,
        gateway: gateway as any,
        gatewayPaymentId: payment.id,
        status: normalizedStatus,
        billingType: billingType,
        kind: 'upgrade',
        value: String(price),
        dueDate,
        invoiceUrl: payment.invoiceUrl || null,
        bankSlipUrl: payment.bankSlipUrl || null,
        pixQrCode: payment.pixQrCode || null,
        pixQrCodeUrl: payment.pixQrCodeUrl || null,
      });
    }
  }

  async refreshSubscriptionFromPayments(params: {
    subscriptionId?: string | null;
    gatewaySubscriptionId?: string | null;
    userId: string;
    status?: SubscriptionStatus | null;
  }): Promise<void> {
    const db = this.database.getDb();

    if (!params.subscriptionId) return;

    const gateway = params.gatewaySubscriptionId ? 
      (params.gatewaySubscriptionId.includes('sub_') ? this.stripePaymentGateway : this.asaasPaymentGateway) : null;

    let gatewaySubscription = null;
    if (gateway && params.gatewaySubscriptionId) {
      try {
        gatewaySubscription = await gateway.getSubscriptionByGatewayId(params.gatewaySubscriptionId);
      } catch (err: any) {
        this.logger.warn(`Falha ao obter assinatura do gateway: ${err.message}`);
      }
    }

    if (!gatewaySubscription) {
      this.logger.warn(
        `Refresh ignorado: assinatura não encontrada no gateway (subscriptionId=${params.subscriptionId}, gatewaySubscriptionId=${params.gatewaySubscriptionId}, statusAtual=${params.status ?? "unknown"})`
      );
      return;
    }

    const latestRecurringPayment = await db
      .select()
      .from(billingPayments)
      .where(and(
        eq(billingPayments.userId, params.userId),
        eq(billingPayments.kind, 'recurring')
      ))
      .orderBy(desc(billingPayments.createdAt))
      .limit(1)
      .then(r => r[0] || null);

    if (!latestRecurringPayment) {
      this.logger.info(`Nenhum pagamento recorrente encontrado para a assinatura ${params.subscriptionId}`);
      return;
    }

    const latestPaymentDueDate = latestRecurringPayment?.dueDate ?? null;
    const hasRecurringPaymentInRealDebt = 
      await this.billingPaymentRepository.hasRecurringPaymentInRealDebt(params.userId, params.subscriptionId);

    const canTransitionFromCurrentStatus =
      !params.status ||
      params.status === SubscriptionStatus.PENDING ||
      params.status === SubscriptionStatus.ACTIVE ||
      params.status === SubscriptionStatus.PAST_DUE;

    // status financeiro da assinatura:
    // ACTIVE quando não há débito recorrente real aberto
    // PAST_DUE quando existe ao menos um débito recorrente real aberto
    // CANCELED/INACTIVE não devem ser reativados por refresh de cobrança
    const newStatus: SubscriptionStatus | null | undefined = canTransitionFromCurrentStatus
      ? (hasRecurringPaymentInRealDebt ? SubscriptionStatus.PAST_DUE : SubscriptionStatus.ACTIVE)
      : params.status;

    const wasPastDue = params.status === SubscriptionStatus.PAST_DUE;
    let pastDueAt: Date | null | undefined = undefined;
    if (newStatus === SubscriptionStatus.PAST_DUE) {
      pastDueAt = wasPastDue ? undefined : new Date();
    } else if (newStatus) {
      pastDueAt = null;
    }

    const gatewayNextDueDate = gatewaySubscription?.nextDueDate ? new Date(gatewaySubscription.nextDueDate) : null;

    // calcula a data de vencimento com base na ultima cobranca
    // caso nao tenha usa a data de vencimento do gateway
    const nextDueDate =
      (latestRecurringPayment.status === PaymentStatus.PENDING) && latestPaymentDueDate
        ? (!gatewayNextDueDate || gatewayNextDueDate > latestPaymentDueDate ? latestPaymentDueDate : gatewayNextDueDate)
        : (gatewayNextDueDate ?? latestPaymentDueDate);

    // atualiza a data de vencimento com base na ultima cobranca
    await db
      .update(userSubscriptions)
      .set({
        status: newStatus ?? undefined,
        pastDueAt,
        nextDueDate: nextDueDate ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.userId, params.subscriptionId));

    // TODO: Implement SSE publishing when BillingSseHub is available
    // const statusSummary = await this.getSubscriptionStatusSummary(params.userId);
    // const summary = statusSummary ?? undefined;
    // this.billingSseHub.publishSubscriptionStatus(params.userId, { summary: summary ?? null });
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
      gatewayName: subRow.gatewayName,
      gatewayCustomerId: subRow.gatewayCustomerId,
    } : {
      userId,
      planId: FREE_PLAN_ID,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
      currentPeriodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
      billingCycle: BillingCycle.MONTHLY,
      billingType: null,
      nextDueDate: null,
      gatewayName: null,
      gatewayCustomerId: null,
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

    const customerRow = await db.select().from(billingCustomers).where(eq(billingCustomers.userId, userId)).limit(1).then(r => r[0] || null);
    const hasCreditCardOnFile = Boolean(customerRow?.hasCreditCardOnFile);

    const scheduledChange = await this.subscriptionChangeService.getScheduledChange(userId);
    let scheduledChangeDTO = null;
    if (scheduledChange) {
      const targetPlan = await db.select().from(plans).where(eq(plans.id, scheduledChange.toPlanId)).limit(1).then(r => r[0] || null);
      scheduledChangeDTO = {
        id: scheduledChange.id,
        userId: scheduledChange.userId,
        fromSubscriptionId: scheduledChange.fromSubscriptionId,
        toPlanId: scheduledChange.toPlanId,
        toPlan: targetPlan ? {
          id: targetPlan.id,
          name: targetPlan.displayName,
          description: targetPlan.description,
          price: targetPlan.priceCents / 100,
          annualPrice: (targetPlan.priceCents * 12 * 0.8) / 100,
          priceUsd: targetPlan.priceUsdCents / 100,
          annualPriceUsd: (targetPlan.priceUsdCents * 12 * 0.8) / 100,
          maxStorageBytes: Number(targetPlan.maxStorageBytes),
          maxAiRequestsPerMonth: targetPlan.maxAiRequestsPerMonth,
          maxWorkspaces: targetPlan.maxWorkspaces,
          maxProjectsPerWorkspace: targetPlan.maxProjectsPerWorkspace,
          isDefault: targetPlan.slug === 'free',
          isVisible: targetPlan.isActive,
        } : null,
        toBillingCycle: scheduledChange.toBillingCycle,
        toBillingType: scheduledChange.toBillingType,
        type: scheduledChange.type,
        status: scheduledChange.status,
        effectiveAt: scheduledChange.effectiveAt.toISOString(),
      };
    }

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

  /**
   * Cria um novo pagamento de assinatura usando SubscriptionContext
   */
  async createNewSubscriptionPaymentFromContext(ctx: SubscriptionContext): Promise<UpdateSubscriptionStrategyResult> {
    const db = this.database.getDb();
    const gateway = ctx.gateway === GatewayNameEnum.STRIPE ? this.stripePaymentGateway : this.asaasPaymentGateway;
    const mapper = ctx.gateway === GatewayNameEnum.STRIPE ? this.stripeGatewayStatusMapper : this.asaasGatewayStatusMapper;

    const creditCardToken = ctx.newBillingType === BillingTypeEnum.CREDIT_CARD ? ctx.newCreditCardToken : undefined;

    const { externalReference } = await this.billingIntentService.createIntentAndExternalReference({
      type: 'new',
      userId: ctx.userId,
      planId: ctx.newPlan.id,
      billingCycle: ctx.newBillingCycle,
      creditCardToken: creditCardToken || null,
    });

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);

    const isBrazil = ctx.gateway === GatewayNameEnum.ASAAS;
    const priceCents = isBrazil ? ctx.newPlan.priceCents : ctx.newPlan.priceUsdCents;
    const price = ctx.newBillingCycle === BillingCycle.YEARLY ? (priceCents * 12 * 0.8) / 100 : priceCents / 100;

    const payment = await gateway.createPayment({
      customerId: ctx.gatewayCustomerId,
      userId: ctx.userId,
      billingType: ctx.newBillingType,
      value: price,
      dueDate: dueDate.toISOString().split('T')[0],
      description: `Primeiro pagamento para plano ${ctx.newPlan.displayName} - ${ctx.user.name}`,
      externalReference,
      creditCardToken,
      kind: 'upgrade' as any,
    });

    const normalizedStatus = mapper.normalizePaymentStatus(payment.status, null) ?? PaymentStatus.PENDING;

    await db.insert(billingPayments).values({
      id: crypto.randomUUID(),
      subscriptionId: ctx.userId,
      userId: ctx.userId,
      gateway: ctx.gateway.toLowerCase() as any,
      gatewayPaymentId: payment.id,
      status: normalizedStatus,
      billingType: ctx.newBillingType === BillingTypeEnum.PIX ? BillingType.PIX : ctx.newBillingType === BillingTypeEnum.BOLETO ? BillingType.BOLETO : BillingType.CREDIT_CARD,
      kind: 'upgrade',
      gatewayStatus: payment.status ?? undefined,
      value: String(price),
      dueDate,
      paidAt: payment.paidAt ? new Date(payment.paidAt) : null,
      invoiceUrl: payment.invoiceUrl || null,
      bankSlipUrl: payment.bankSlipUrl || null,
      pixQrCode: payment.pixQrCode || null,
      pixQrCodeUrl: payment.pixQrCodeUrl || null,
      description: payment.description || 'NEW',
    });

    const statusSummary = await this.getSubscriptionStatusSummary(ctx.userId);
    const summary = statusSummary ?? undefined;

    // TODO: Implement SSE publishing when BillingSseHub is available
    // this.billingSseHub.publishSubscriptionStatus(ctx.userId, { summary: summary ?? null });

    const changeKind: SubscriptionChangeKind = SubscriptionChangeKind.NEW;

    return { summary, changeKind };
  }

  /**
   * Realiza upgrade de assinatura com prorrateamento
   */
  async upgradeSubscriptionWithProration(ctx: SubscriptionContext): Promise<UpdateSubscriptionStrategyResult> {
    const db = this.database.getDb();

    if (!ctx.activeSub) {
      throw new BadRequestException('Não é possível realizar upgrade sem uma assinatura ativa');
    }

    const currentSub = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, ctx.userId)).limit(1).then(r => r[0] || null);
    if (currentSub?.status === SubscriptionStatus.PAST_DUE) {
      throw new BadRequestException('Não é possível realizar upgrade com assinatura em atraso. Regularize a cobrança recorrente pendente e tente novamente.');
    }

    // Calcula o valor do primeiro pagamento conforme diferença (prorata)
    const firstPaymentValue = await this.subscriptionUpgradeService.calculateProrationUpgradeValue({
      currentPlanId: ctx.activePlan?.id || '',
      newPlanId: ctx.newPlan.id,
      billingCycle: ctx.activeSub.billingCycle,
      currentPeriodEnd: ctx.activeSub.nextDueDate || new Date()
    });

    const gateway = ctx.gateway === GatewayNameEnum.STRIPE ? this.stripePaymentGateway : this.asaasPaymentGateway;
    const mapper = ctx.gateway === GatewayNameEnum.STRIPE ? this.stripeGatewayStatusMapper : this.asaasGatewayStatusMapper;

    const creditCardToken = ctx.newBillingType === BillingTypeEnum.CREDIT_CARD ? ctx.newCreditCardToken : undefined;

    const { externalReference } = await this.billingIntentService.createIntentAndExternalReference({
      type: 'upgrade',
      userId: ctx.userId,
      planId: ctx.newPlan.id,
      billingCycle: ctx.newBillingCycle,
      creditCardToken: creditCardToken || null,
      subscriptionId: ctx.activeSub.id,
    });

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);

    const payment = await gateway.createPayment({
      customerId: ctx.gatewayCustomerId,
      userId: ctx.userId,
      billingType: ctx.newBillingType,
      value: firstPaymentValue,
      dueDate: dueDate.toISOString().split('T')[0],
      description: `Pagamento de upgrade para plano ${ctx.newPlan.displayName} - ${ctx.user.name}`,
      externalReference,
      creditCardToken,
      kind: 'upgrade' as any,
    });

    const normalizedStatus = mapper.normalizePaymentStatus(payment.status, null) ?? PaymentStatus.PENDING;

    await db.insert(billingPayments).values({
      id: crypto.randomUUID(),
      subscriptionId: ctx.activeSub.id,
      userId: ctx.userId,
      gateway: ctx.gateway.toLowerCase() as any,
      gatewayPaymentId: payment.id,
      status: normalizedStatus,
      billingType: ctx.newBillingType === BillingTypeEnum.PIX ? BillingType.PIX : ctx.newBillingType === BillingTypeEnum.BOLETO ? BillingType.BOLETO : BillingType.CREDIT_CARD,
      kind: 'upgrade',
      gatewayStatus: payment.status ?? undefined,
      value: String(firstPaymentValue),
      dueDate,
      paidAt: payment.paidAt ? new Date(payment.paidAt) : null,
      invoiceUrl: payment.invoiceUrl || null,
      bankSlipUrl: payment.bankSlipUrl || null,
      pixQrCode: payment.pixQrCode || null,
      pixQrCodeUrl: payment.pixQrCodeUrl || null,
      description: payment.description || 'UPGRADE',
    });

    const statusSummary = await this.getSubscriptionStatusSummary(ctx.userId);
    const summary = statusSummary ?? undefined;

    // TODO: Implement SSE publishing when BillingSseHub is available
    // this.billingSseHub.publishSubscriptionStatus(ctx.userId, { summary: summary ?? null });

    const changeKind: SubscriptionChangeKind = SubscriptionChangeKind.UPGRADE;

    return { summary, changeKind };
  }

  /**
   * Realiza downgrade de assinatura
   */
  async downgradeSubscription(ctx: SubscriptionContext): Promise<UpdateSubscriptionStrategyResult> {
    if (!ctx.activeSub) {
      throw new BadRequestException('Não é possível realizar downgrade sem uma assinatura ativa');
    }

    const effectiveAt = new Date();
    effectiveAt.setDate(effectiveAt.getDate() - 1); // 1 dia antes do vencimento

    await this.subscriptionChangeService.scheduleChange({
      userId: ctx.userId,
      fromSubscriptionId: ctx.activeSub.id,
      fromGateway: ctx.activeSub.gatewayName,
      fromGatewaySubscriptionId: ctx.activeSub.gatewaySubscriptionId,
      toPlanId: ctx.newPlan.id,
      toBillingCycle: ctx.newBillingCycle,
      toBillingType: ctx.newBillingType === BillingTypeEnum.PIX ? BillingType.PIX : ctx.newBillingType === BillingTypeEnum.BOLETO ? BillingType.BOLETO : BillingType.CREDIT_CARD,
      type: SubscriptionChangeType.DOWNGRADE,
      effectiveAt
    });

    const statusSummary = await this.getSubscriptionStatusSummary(ctx.userId);
    const summary = statusSummary ?? undefined;

    // TODO: Implement SSE publishing when BillingSseHub is available
    // this.billingSseHub.publishSubscriptionStatus(ctx.userId, { summary: summary ?? null });

    const changeKind: SubscriptionChangeKind = SubscriptionChangeKind.DOWNGRADE;

    return { summary, changeKind };
  }

  /**
   * Realiza mudança de ciclo de assinatura
   */
  async changeCycleSubscription(ctx: SubscriptionContext): Promise<UpdateSubscriptionStrategyResult> {
    if (!ctx.activeSub) {
      throw new BadRequestException('Não é possível realizar uma mudança de ciclo sem uma assinatura ativa');
    }

    const effectiveAt = new Date();
    effectiveAt.setDate(effectiveAt.getDate() - 1); // 1 dia antes do vencimento

    await this.subscriptionChangeService.scheduleChange({
      userId: ctx.userId,
      fromSubscriptionId: ctx.activeSub.id,
      fromGateway: ctx.activeSub.gatewayName,
      fromGatewaySubscriptionId: ctx.activeSub.gatewaySubscriptionId,
      toPlanId: ctx.newPlan.id,
      toBillingCycle: ctx.newBillingCycle,
      toBillingType: ctx.newBillingType === BillingTypeEnum.PIX ? BillingType.PIX : ctx.newBillingType === BillingTypeEnum.BOLETO ? BillingType.BOLETO : BillingType.CREDIT_CARD,
      type: SubscriptionChangeType.CHANGE_CYCLE,
      effectiveAt
    });

    const statusSummary = await this.getSubscriptionStatusSummary(ctx.userId);
    const summary = statusSummary ?? undefined;

    // TODO: Implement SSE publishing when BillingSseHub is available
    // this.billingSseHub.publishSubscriptionStatus(ctx.userId, { summary: summary ?? null });

    const changeKind: SubscriptionChangeKind = SubscriptionChangeKind.CHANGE_CYCLE;

    return { summary, changeKind };
  }



  private resolvePlanValueForCycle(plan: { priceCents: number; priceUsdCents: number }, cycle: BillingCycle): number {
    if (cycle === BillingCycle.YEARLY) {
      const annualPrice = (plan.priceCents * 12 * 0.8) / 100;
      return annualPrice;
    }
    return plan.priceCents / 100;
  }
}
