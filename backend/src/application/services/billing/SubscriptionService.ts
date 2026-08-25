import { Injectable, BadRequestException } from '@nestjs/common';
import crypto from 'node:crypto';
import { AppLogger } from '../../../observability/logger.js';
import { AsaasPaymentGateway } from '../../../infrastructure/billing/gateways/asaas/AsaasPaymentGateway.js';
import { StripePaymentGateway } from '../../../infrastructure/billing/gateways/stripe/StripePaymentGateway.js';
import { AsaasGatewayStatusMapper } from '../../../infrastructure/billing/gateways/asaas/AsaasGatewayStatusMapper.js';
import { StripeGatewayStatusMapper } from '../../../infrastructure/billing/gateways/stripe/StripeGatewayStatusMapper.js';
import { GatewayNameEnum } from '../../../infrastructure/billing/gateways/IPaymentGateway.js';
import { toGatewayBillingType } from '../../../infrastructure/billing/helpers/billingTypeMapper.js';
import {
  BillingCycle,
  BillingType,
  SubscriptionStatus,
  SubscriptionChangeType,
  SubscriptionChangeStatus,
  SubscriptionChangeKind,
  PaymentStatus,
  BillingIntentType,
} from '../../../domain/enums/billing.enums.js';
import { FREE_PLAN_ID, SubscriptionPlan } from '../../../domain/enums/plans.enums.js';
import { formatGatewayDueDate, getNextDueDate } from '../../../domain/utils/subscription.utils.js';
import { resolvePlanValueForCycle } from '../../../domain/utils/plan-pricing.utils.js';
import { PAYMENT_GATEWAY, COUNTRY_CODE } from '../../../domain/constants/billing.constants.js';
import { BillingIntentService } from './BillingIntentService.js';
import { SubscriptionUpgradeService } from './SubscriptionUpgradeService.js';
import { SubscriptionContext } from './subscriptionStrategy/subscriptionContext.js';
import type { SubscriptionChangeResult } from '../../models/subscription-change.models.js';
import { SubscriptionChangeService } from './SubscriptionChangeService.js';
import { BillingPaymentRepository, SubscriptionRepository, BillingCustomerRepository } from '../../ports/billing/billing-repositories.js';
import { SubscriptionPlanMapper, BillingPaymentMapper } from '../../mappers/billing.mapper.js';
import { UserRepository } from '../../ports/auth/auth.repository.js';
import { UpdateSubscriptionStrategyFactory } from './subscriptionStrategy/UpdateSubscriptionStrategyFactory.js';
import { canCancelPayment, isActiveSubscriptionStatus } from '../../../infrastructure/utils/billing/paymentUtils.js';


@Injectable()
export class SubscriptionService {
  constructor(
    private readonly logger: AppLogger,
    private readonly billingIntentService: BillingIntentService,
    private readonly subscriptionUpgradeService: SubscriptionUpgradeService,
    private readonly subscriptionChangeService: SubscriptionChangeService,
    private readonly asaasPaymentGateway: AsaasPaymentGateway,
    private readonly stripePaymentGateway: StripePaymentGateway,
    private readonly asaasGatewayStatusMapper: AsaasGatewayStatusMapper,
    private readonly stripeGatewayStatusMapper: StripeGatewayStatusMapper,
    private readonly billingPaymentRepository: BillingPaymentRepository,
    private readonly updateSubscriptionStrategyFactory: UpdateSubscriptionStrategyFactory,
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly billingCustomerRepository: BillingCustomerRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async getPlans() {
    const activePlans = await this.subscriptionRepository.getActivePlans();
    return activePlans.map(SubscriptionPlanMapper.toPlanDto);
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
    creditCardToken?: string,
  ): Promise<SubscriptionChangeResult> {
    const targetPlan = await this.subscriptionRepository.getPlanById(planId);

    if (!targetPlan) {
      throw new BadRequestException('Plan not found');
    }
    if (!targetPlan.isActive) {
      throw new BadRequestException('Plan unavailable');
    }

    const currentSub = await this.subscriptionRepository.getSubscriptionByUserId(userId);

    if (!cpfCnpj) {
      const user = await this.userRepository.findUserById(userId);
      cpfCnpj = user?.cpfCnpj || '';
    }

    if (cpfCnpj) {
      const user = await this.userRepository.findUserById(userId);
      if (user && user.cpfCnpj !== cpfCnpj) {
        await this.userRepository.updateUser({ userId, cpfCnpj });
      }
    }

    const cycle = billingCycle || BillingCycle.MONTHLY;
    const type = billingType || BillingType.CREDIT_CARD;
    const normalizedCreditCardToken = creditCardToken?.trim() || undefined;
    const isFreePlan = targetPlan.slug === SubscriptionPlan.FREE;

    const onlyStripe = process.env.ONLY_STRIPE === 'true';
    const isBrazil = countryCode?.toUpperCase() === COUNTRY_CODE.BRAZIL;
    const isInternational = onlyStripe || !isBrazil;
    const gatewayName = onlyStripe ? PAYMENT_GATEWAY.STRIPE : (isBrazil ? PAYMENT_GATEWAY.ASAAS : PAYMENT_GATEWAY.STRIPE);
    const gateway = onlyStripe ? this.stripePaymentGateway : (isBrazil ? this.asaasPaymentGateway : this.stripePaymentGateway);

    if (isInternational && (type === BillingType.PIX || type === BillingType.BOLETO)) {
      throw new BadRequestException('PIX and Boleto payments are only available for Brazilian users. Please select Credit Card.');
    }

    if (isBrazil && !onlyStripe) {
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
      throw new BadRequestException('Your subscription has a past due payment. Please settle the pending payment to change plan or cycle.');
    }

    if (
      currentSub &&
      currentSub.planId === planId &&
      currentSub.billingCycle === cycle &&
      currentSub.status === SubscriptionStatus.ACTIVE
    ) {
      throw new BadRequestException('You are already subscribed to this plan with the same billing cycle.');
    }

    const activeSubRow =
      currentSub && isActiveSubscriptionStatus(currentSub.status) ? currentSub : null;

    if (activeSubRow) {
      const isScheduled = await this.subscriptionChangeService.isChangeScheduled(userId);
      if (isScheduled) {
        throw new BadRequestException('A plan change is already scheduled. Please wait or cancel the scheduled change before selecting a new plan.');
      }
    }

    const shouldCheckCardOnFile =
      type === BillingType.CREDIT_CARD || cycle === BillingCycle.MONTHLY;

    const getCustomer = async () => this.billingCustomerRepository.getCustomerByUserId(userId, gatewayName as any);

    if (shouldCheckCardOnFile && cycle === BillingCycle.MONTHLY && type !== BillingType.CREDIT_CARD) {
      const customerRow = await getCustomer();
      const hasCreditCardOnFile = Boolean(customerRow?.hasCreditCardOnFile);
      if (hasCreditCardOnFile) {
        throw new BadRequestException('With a registered card, monthly subscriptions must use credit card.');
      }
    }

    if (isInternational && type === BillingType.CREDIT_CARD && !isFreePlan) {
      const customerRow = await getCustomer();
      const hasCreditCardOnFile = Boolean(customerRow?.hasCreditCardOnFile);
      if (!hasCreditCardOnFile && !normalizedCreditCardToken) {
        throw new BadRequestException('Credit card details are required for international subscriptions.');
      }
    }

    // Create or sync the gateway customer id for the selected gateway.
    let gatewayCustomerId = '';
    const customerRow = await getCustomer();
    if (customerRow?.gatewayCustomerId) {
      gatewayCustomerId = customerRow.gatewayCustomerId;
    }
    if (!gatewayCustomerId) {
      const customer = await gateway.createCustomer({
        name: userDisplayName || userEmail,
        email: userEmail,
        cpfCnpj: !isInternational ? (cpfCnpj || undefined) : undefined,
        externalReference: userId,
      });
      gatewayCustomerId = customer.id;
    }

    await this.billingCustomerRepository.upsertCustomer(userId, gatewayName as any, gatewayCustomerId);

    let activePlanRow = null;
    if (activeSubRow) {
      activePlanRow = await this.subscriptionRepository.getPlanById(activeSubRow.planId);
    }
    const activePlan = activePlanRow ? {
      id: activePlanRow.id,
      slug: activePlanRow.slug,
      displayName: activePlanRow.displayName,
      priceCents: activePlanRow.priceCents,
      priceUsdCents: activePlanRow.priceUsdCents,
      maxStorageBytes: Number(activePlanRow.maxStorageBytes),
      maxAiCreditsPerMonth: activePlanRow.maxAiCreditsPerMonth,
      maxWorkspaces: activePlanRow.maxWorkspaces,
      maxProjectsPerWorkspace: activePlanRow.maxProjectsPerWorkspace,
      isActive: activePlanRow.isActive,
    } : undefined;

    const newSubscriptionValue = resolvePlanValueForCycle(
      {
        priceCents: targetPlan.priceCents,
        priceUsdCents: targetPlan.priceUsdCents,
      },
      cycle,
      gatewayName === PAYMENT_GATEWAY.ASAAS ? GatewayNameEnum.ASAAS : GatewayNameEnum.STRIPE,
    );

    const ctx: SubscriptionContext = {
      userId,
      newPlan: targetPlan,
      newBillingCycle: cycle,
      newBillingType: type,
      newCreditCardToken: normalizedCreditCardToken,
      newSubscriptionValue,
      user: {
        id: userId,
        name: userDisplayName || userEmail,
      },
      gateway: gatewayName === PAYMENT_GATEWAY.ASAAS ? GatewayNameEnum.ASAAS : GatewayNameEnum.STRIPE,
      gatewayCustomerId,
      activeSub: activeSubRow ? {
        id: activeSubRow.userId,
        planId: activeSubRow.planId,
        billingCycle: activeSubRow.billingCycle === 'monthly' ? BillingCycle.MONTHLY : BillingCycle.YEARLY,
        gatewaySubscriptionId: activeSubRow.gatewaySubscriptionId || '',
        nextDueDate: activeSubRow.nextDueDate || undefined,
        gatewayName: activeSubRow.gatewayName || gatewayName,
      } : undefined,
      activePlan,
    };

    const kind = this.updateSubscriptionStrategyFactory.getChangeKind(ctx);

    switch (kind) {
      case SubscriptionChangeKind.NEW:
        return this.createNewSubscriptionPayment(ctx);
      case SubscriptionChangeKind.UPGRADE:
        return this.upgradeSubscriptionWithProration(ctx);
      case SubscriptionChangeKind.DOWNGRADE:
        return this.downgradeSubscription(ctx);
      case SubscriptionChangeKind.CHANGE_CYCLE:
        return this.changeCycleSubscription(ctx);
      default:
        throw new BadRequestException('Unsupported subscription change');
    }
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
    const gatewayName = params.gatewayName || PAYMENT_GATEWAY.ASAAS;
    const gateway = gatewayName === PAYMENT_GATEWAY.STRIPE ? this.stripePaymentGateway : this.asaasPaymentGateway;

    const targetPlan = await this.subscriptionRepository.getPlanById(params.targetPlanId);
    if (!targetPlan) {
      throw new BadRequestException('Plan not found');
    }

    const isBrazil = gatewayName === PAYMENT_GATEWAY.ASAAS;
    const priceCents = isBrazil ? targetPlan.priceCents : targetPlan.priceUsdCents;
    const price = params.billingCycle === BillingCycle.YEARLY ? (priceCents * 12 * 0.8) / 100 : priceCents / 100;

    const effectiveActivationDate = params.activationDate || new Date();
    const nextDueDate = getNextDueDate(effectiveActivationDate, params.billingCycle);
    const currentPeriodStart = effectiveActivationDate;
    const currentPeriodEnd = nextDueDate;

    const gatewaySubscription = await gateway.createSubscription({
      customerId: params.gatewayCustomerId,
      billingType: toGatewayBillingType(params.billingType ?? BillingType.CREDIT_CARD),
      value: price,
      cycle: params.billingCycle === BillingCycle.YEARLY ? 'YEARLY' as any : 'MONTHLY' as any,
      nextDueDate: formatGatewayDueDate(nextDueDate),
      description: `Subscription ${targetPlan.displayName}`,
      creditCardToken: params.billingType === BillingType.CREDIT_CARD ? params.creditCardToken : undefined,
      userId: params.userId,
      externalReference: params.createdFromIntentId || params.userId,
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
      createdFromIntentId: params.createdFromIntentId ?? null,
    };

    await this.subscriptionRepository.upsertUserSubscription(params.userId, values as any);

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

      const paymentMapper = gatewayName === PAYMENT_GATEWAY.ASAAS 
        ? this.asaasGatewayStatusMapper 
        : this.stripeGatewayStatusMapper;

      const pendingPayments = (subscriptionPayments ?? []).filter((payment: any) => {
        if (!payment?.id) return false;
        const normalizedStatus = paymentMapper.normalizePaymentStatus(payment.status, null);
        return normalizedStatus === PaymentStatus.PENDING;
      });

      const autoGeneratedPayment = pendingPayments.find((payment: any) => {
        if (!payment.dueDate) return true;
        const parsedDueDate = new Date(payment.dueDate);
        if (!parsedDueDate) return true;
        return parsedDueDate.toISOString().split('T')[0] === dueDateReference;
      }) ?? pendingPayments[0];

      if (autoGeneratedPayment?.id) {
        const safeAutoGeneratedDueDate = autoGeneratedPayment.dueDate ? new Date(autoGeneratedPayment.dueDate) : currentPeriodEnd;
        const normalizedStatus = paymentMapper.normalizePaymentStatus(autoGeneratedPayment.status, null) ?? PaymentStatus.PENDING;

        await this.billingPaymentRepository.upsertSubscriptionPayment({
          id: crypto.randomUUID(),
          subscriptionId: params.userId,
          userId: params.userId,
          gateway: gatewayName as any,
          gatewayPaymentId: autoGeneratedPayment.id,
          status: normalizedStatus,
          billingType: autoGeneratedPayment.billingType ?? params.billingType ?? null,
          gatewayStatus: autoGeneratedPayment.status ?? null,
          value: autoGeneratedPayment.value ?? price,
          dueDate: safeAutoGeneratedDueDate,
          paidAt: autoGeneratedPayment.paidAt ? new Date(autoGeneratedPayment.paidAt) : null,
          invoiceUrl: autoGeneratedPayment.invoiceUrl || null,
          bankSlipUrl: autoGeneratedPayment.bankSlipUrl || null,
          pixQrCode: autoGeneratedPayment.pixQrCode || null,
          pixQrCodeUrl: autoGeneratedPayment.pixQrCodeUrl || null,
          description: autoGeneratedPayment.description || null,
          kind: 'recurring',
        });

        this.logger.info(`Recurring payment ${autoGeneratedPayment.id} synced after subscription creation`);
      }
    } catch (err) {
      this.logger.error(`Failed to sync recurring payment after subscription creation: ${err}`);
    }

    return { id: params.userId };
  }

  async confirmUpgrade(subscriptionId: string, targetPlanId: string): Promise<void> {
    const sub = await this.subscriptionRepository.getSubscriptionByUserId(subscriptionId);
    if (!sub) {
      throw new BadRequestException('Subscription not found');
    }

    const plan = await this.subscriptionRepository.getPlanById(targetPlanId);
    if (!plan) {
      throw new BadRequestException('Plan not found');
    }

    const paymentGateway = sub.gatewayName === PAYMENT_GATEWAY.STRIPE ? this.stripePaymentGateway : this.asaasPaymentGateway;
    const billingCycle = (sub.billingCycle as string) === 'yearly' ? BillingCycle.YEARLY : BillingCycle.MONTHLY;
    const gatewayEnum = sub.gatewayName === PAYMENT_GATEWAY.STRIPE ? GatewayNameEnum.STRIPE : GatewayNameEnum.ASAAS;
    const targetRecurringValue = resolvePlanValueForCycle(plan, billingCycle, gatewayEnum);

    // Sync subscription value in gateway for next cycles
    if (sub.gatewaySubscriptionId) {
      try {
        await paymentGateway.updateSubscription(sub.gatewaySubscriptionId, {
          value: targetRecurringValue,
          updatePendingPayments: true,
        });

        // Sync pending payments after upgrade
        await this.subscriptionChangeService.syncPendingRecurringPaymentsAfterUpgrade(
          { id: sub.userId, userId: subscriptionId, gatewaySubscriptionId: sub.gatewaySubscriptionId, gatewayName: sub.gatewayName },
          targetRecurringValue
        );

        this.logger.info(`Subscription ${subscriptionId} updated in gateway after upgrade to plan ${targetPlanId}`);
      } catch (err: any) {
        this.logger.error(`Failed to update subscription in gateway after upgrade: ${err.message}`);
        // Continue with local update even if gateway fails
      }
    }

    // Update subscription plan locally
    await this.subscriptionRepository.upsertUserSubscription(subscriptionId, {
      planId: targetPlanId,
    });
  }

  async refreshSubscriptionFromPayments(params: {
    subscriptionId?: string | null;
    gatewaySubscriptionId?: string | null;
    userId: string;
    status?: SubscriptionStatus | null;
  }): Promise<void> {
    if (!params.subscriptionId) return;

    const gateway = params.gatewaySubscriptionId ? 
      (params.gatewaySubscriptionId.includes('sub_') ? this.stripePaymentGateway : this.asaasPaymentGateway) : null;

    let gatewaySubscription = null;
    if (gateway && params.gatewaySubscriptionId) {
      try {
        gatewaySubscription = await gateway.getSubscriptionByGatewayId(params.gatewaySubscriptionId);
      } catch (err: any) {
        this.logger.warn(`Failed to get subscription from gateway: ${err.message}`);
      }
    }

    if (!gatewaySubscription) {
      this.logger.warn(
        `Refresh ignored: subscription not found in gateway (subscriptionId=${params.subscriptionId}, gatewaySubscriptionId=${params.gatewaySubscriptionId}, currentStatus=${params.status ?? "unknown"})`
      );
      return;
    }

    const latestRecurringPayment = await this.billingPaymentRepository.getLatestPendingPaymentByUserId(params.userId);

    if (!latestRecurringPayment) {
      this.logger.info(`No recurring payment found for subscription ${params.subscriptionId}`);
      return;
    }

    const subRow = await this.subscriptionRepository.getSubscriptionByUserId(params.subscriptionId);

    if (!subRow) {
      this.logger.warn(`Subscription row not found in database: ${params.subscriptionId}`);
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

    // subscription financial status:
    // ACTIVE when there is no open real recurring debt
    // PAST_DUE when there is at least one open real recurring debt
    // CANCELED/INACTIVE should not be reactivated by payment refresh
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

    // calculate due date based on last payment
    // if not available, use gateway due date
    const nextDueDate =
      (latestRecurringPayment.status === PaymentStatus.PENDING || latestRecurringPayment.status === PaymentStatus.OVERDUE) && latestPaymentDueDate
        ? (!gatewayNextDueDate || gatewayNextDueDate > latestPaymentDueDate ? latestPaymentDueDate : gatewayNextDueDate)
        : (gatewayNextDueDate ?? latestPaymentDueDate);

    // Calculate new currentPeriodEnd and currentPeriodStart based on nextDueDate and billingCycle
    let currentPeriodStart: Date | undefined;
    let currentPeriodEnd: Date | undefined;

    if (nextDueDate) {
      currentPeriodEnd = new Date(nextDueDate);
      currentPeriodStart = new Date(nextDueDate);
      if (subRow.billingCycle === BillingCycle.YEARLY) {
        currentPeriodStart.setUTCFullYear(currentPeriodStart.getUTCFullYear() - 1);
      } else {
        currentPeriodStart.setUTCMonth(currentPeriodStart.getUTCMonth() - 1);
      }
    }

    // update due date based on last payment
    await this.subscriptionRepository.upsertUserSubscription(params.subscriptionId, {
      status: newStatus ?? undefined,
      pastDueAt,
      nextDueDate: nextDueDate ?? undefined,
      currentPeriodStart: currentPeriodStart ?? undefined,
      currentPeriodEnd: currentPeriodEnd ?? undefined,
    });
  }

  async getSubscriptionByCreatedFromIntentId(userId: string, intentId: string) {
    return this.subscriptionRepository.getSubscriptionByCreatedFromIntentId(userId, intentId);
  }

  async getSubscriptionStatusSummary(userId: string) {
    const subRow = await this.subscriptionRepository.getSubscriptionByUserId(userId);
    
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
    } : null;

    const activeSubSummary = (subRow && (subRow.status === SubscriptionStatus.ACTIVE || subRow.status === SubscriptionStatus.PAST_DUE)) ? latestSubSummary : null;

    const paymentRow = await this.billingPaymentRepository.getLatestPendingPaymentByUserId(userId);

    const latestPendingPaymentSummary = BillingPaymentMapper.toPendingPaymentSummary(paymentRow);

    const customerGateway = (subRow?.gatewayName || PAYMENT_GATEWAY.ASAAS) as any;
    const customerRow = await this.billingCustomerRepository.getCustomerByUserId(userId, customerGateway);
    const hasCreditCardOnFile = Boolean(customerRow?.hasCreditCardOnFile);

    const scheduledChange = await this.subscriptionChangeService.getScheduledChange(userId);
    let scheduledChangeDTO = null;
    if (scheduledChange) {
      const targetPlan = await this.subscriptionRepository.getPlanById(scheduledChange.toPlanId);
      scheduledChangeDTO = {
        id: scheduledChange.id,
        userId: scheduledChange.userId,
        fromSubscriptionId: scheduledChange.fromSubscriptionId,
        toPlanId: scheduledChange.toPlanId,
        toPlan: targetPlan ? SubscriptionPlanMapper.toPlanDto(targetPlan) : null,
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
      entitledUntil: activeSubSummary?.nextDueDate ?? null,
      hasCreditCardOnFile,
    };
  }

  async createNewSubscriptionPayment(ctx: SubscriptionContext): Promise<SubscriptionChangeResult> {
    const price = resolvePlanValueForCycle(ctx.newPlan, ctx.newBillingCycle, ctx.gateway);
    await this.createOneShotPayment({
      ctx,
      intentType: BillingIntentType.NEW,
      paymentValue: price,
      paymentDescription: SubscriptionChangeKind.NEW,
      description: `First payment for plan ${ctx.newPlan.displayName} - ${ctx.user.name}`,
    });
    return this.buildSubscriptionChangeResult(ctx.userId, SubscriptionChangeKind.NEW);
  }

  async upgradeSubscriptionWithProration(ctx: SubscriptionContext): Promise<SubscriptionChangeResult> {
    if (!ctx.activeSub) {
      throw new BadRequestException('Cannot perform upgrade without an active subscription');
    }

    const currentSub = await this.subscriptionRepository.getSubscriptionByUserId(ctx.userId);
    if (currentSub?.status === SubscriptionStatus.PAST_DUE) {
      throw new BadRequestException('Cannot perform upgrade with past due subscription. Please settle the pending recurring payment and try again.');
    }

    const firstPaymentValue = await this.subscriptionUpgradeService.getUpgradeFirstPaymentValue(ctx);

    await this.createOneShotPayment({
      ctx,
      intentType: BillingIntentType.UPGRADE,
      paymentValue: firstPaymentValue,
      paymentDescription: SubscriptionChangeKind.UPGRADE,
      description: `Upgrade payment for plan ${ctx.newPlan.displayName} - ${ctx.user.name}`,
      subscriptionId: ctx.activeSub.id,
    });

    return this.buildSubscriptionChangeResult(ctx.userId, SubscriptionChangeKind.UPGRADE);
  }

  async downgradeSubscription(ctx: SubscriptionContext): Promise<SubscriptionChangeResult> {
    if (!ctx.activeSub) {
      throw new BadRequestException('Cannot perform downgrade without an active subscription');
    }

    const effectiveAt = new Date(ctx.activeSub.nextDueDate || Date.now());
    effectiveAt.setDate(effectiveAt.getDate() - 1);

    await this.subscriptionChangeService.scheduleChange({
      userId: ctx.userId,
      fromSubscriptionId: ctx.activeSub.id,
      fromGateway: ctx.activeSub.gatewayName,
      fromGatewaySubscriptionId: ctx.activeSub.gatewaySubscriptionId,
      toPlanId: ctx.newPlan.id,
      toBillingCycle: ctx.newBillingCycle,
      toBillingType: ctx.newBillingType,
      type: SubscriptionChangeType.DOWNGRADE,
      effectiveAt,
    });

    return this.buildSubscriptionChangeResult(ctx.userId, SubscriptionChangeKind.DOWNGRADE);
  }

  async changeCycleSubscription(ctx: SubscriptionContext): Promise<SubscriptionChangeResult> {
    if (!ctx.activeSub) {
      throw new BadRequestException('Cannot perform cycle change without an active subscription');
    }

    const effectiveAt = new Date(ctx.activeSub.nextDueDate || Date.now());
    effectiveAt.setDate(effectiveAt.getDate() - 1);

    await this.subscriptionChangeService.scheduleChange({
      userId: ctx.userId,
      fromSubscriptionId: ctx.activeSub.id,
      fromGateway: ctx.activeSub.gatewayName,
      fromGatewaySubscriptionId: ctx.activeSub.gatewaySubscriptionId,
      toPlanId: ctx.newPlan.id,
      toBillingCycle: ctx.newBillingCycle,
      toBillingType: ctx.newBillingType,
      type: SubscriptionChangeType.CHANGE_CYCLE,
      effectiveAt,
    });

    return this.buildSubscriptionChangeResult(ctx.userId, SubscriptionChangeKind.CHANGE_CYCLE);
  }

  private async buildSubscriptionChangeResult(
    userId: string,
    changeKind: SubscriptionChangeKind,
  ): Promise<SubscriptionChangeResult> {
    const summary = await this.getSubscriptionStatusSummary(userId);
    return { summary: summary ?? undefined, changeKind };
  }

  private async createOneShotPayment(params: {
    ctx: SubscriptionContext;
    intentType: BillingIntentType.NEW | BillingIntentType.UPGRADE;
    paymentValue: number;
    paymentDescription: SubscriptionChangeKind;
    description: string;
    subscriptionId?: string;
  }): Promise<void> {
    const { ctx, intentType, paymentValue, paymentDescription, description, subscriptionId } = params;
    const gateway = ctx.gateway === GatewayNameEnum.STRIPE ? this.stripePaymentGateway : this.asaasPaymentGateway;
    const mapper = ctx.gateway === GatewayNameEnum.STRIPE ? this.stripeGatewayStatusMapper : this.asaasGatewayStatusMapper;
    const creditCardToken = ctx.newBillingType === BillingType.CREDIT_CARD ? ctx.newCreditCardToken : undefined;

    const { externalReference } = await this.billingIntentService.createIntentAndExternalReference({
      type: intentType,
      userId: ctx.userId,
      planId: ctx.newPlan.id,
      billingCycle: ctx.newBillingCycle,
      creditCardToken: creditCardToken || null,
      subscriptionId,
    });

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);

    const payment = await gateway.createPayment({
      customerId: ctx.gatewayCustomerId,
      userId: ctx.userId,
      billingType: toGatewayBillingType(ctx.newBillingType),
      value: paymentValue,
      dueDate: dueDate.toISOString().split('T')[0],
      description,
      externalReference,
      creditCardToken,
      kind: 'upgrade' as any,
    });

    const normalizedStatus = mapper.normalizePaymentStatus(payment.status, null) ?? PaymentStatus.PENDING;

    await this.billingPaymentRepository.upsertSubscriptionPayment({
      id: crypto.randomUUID(),
      subscriptionId: subscriptionId ?? ctx.userId,
      userId: ctx.userId,
      gateway: ctx.gateway.toLowerCase() as any,
      gatewayPaymentId: payment.id,
      status: normalizedStatus,
      billingType: ctx.newBillingType,
      kind: 'upgrade',
      gatewayStatus: payment.status ?? undefined,
      value: paymentValue,
      dueDate,
      paidAt: payment.paidAt ? new Date(payment.paidAt) : null,
      invoiceUrl: payment.invoiceUrl || null,
      bankSlipUrl: payment.bankSlipUrl || null,
      pixQrCode: payment.pixQrCode || null,
      pixQrCodeUrl: payment.pixQrCodeUrl || null,
      description: payment.description || paymentDescription,
      stripeClientSecret: payment.stripeClientSecret || null,
    });
  }
}
