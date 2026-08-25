import { BadRequestException, Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import { BillingCycle, BillingIntentStatus, BillingIntentType } from '../../../domain/enums/billing.enums.js';
import { buildExternalReference } from '../../../infrastructure/billing/gateways/asaas/AsaasHelpers.js';
import { BillingIntentRepository } from '../../ports/billing/billing-repositories.js';

@Injectable()
export class BillingIntentService {
  constructor(
    private readonly billingIntentRepository: BillingIntentRepository,
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

    const intent = await this.billingIntentRepository.getIntentById(intentId);

    if (!intent) {
      return { shouldProcess: false, intent: null };
    }

    const shouldProcess =
      intent.status === BillingIntentStatus.PENDING ||
      intent.status === BillingIntentStatus.PROCESSING;

    return { shouldProcess, intent };
  }

  async createIntentAndExternalReference(params: {
    type: BillingIntentType.NEW | BillingIntentType.UPGRADE;
    userId: string;
    planId: string;
    billingCycle: BillingCycle;
    subscriptionId?: string;
    creditCardToken?: string | null;
  }): Promise<{ externalReference: string }> {
    // Check for duplicate pending intents for NEW or UPGRADE types
    if (params.type === BillingIntentType.NEW || params.type === BillingIntentType.UPGRADE) {
      const pendingOneShotIntent = await this.billingIntentRepository.getPendingOneShotIntentByUserId(params.userId);

      if (pendingOneShotIntent && (pendingOneShotIntent.type === BillingIntentType.NEW || pendingOneShotIntent.type === BillingIntentType.UPGRADE)) {
        throw new BadRequestException('There is already a pending charge awaiting payment');
      }
    }
    
    const intentId = crypto.randomUUID();

    await this.billingIntentRepository.createIntent({
      id: intentId,
      type: params.type,
      status: BillingIntentStatus.PENDING,
      userId: params.userId,
      planId: params.planId,
      subscriptionId: params.subscriptionId || null,
      billingCycle: params.billingCycle,
      creditCardToken: params.creditCardToken || null,
    });

    const externalReference = buildExternalReference(params.type, intentId);
    return { externalReference };
  }

  async claimForProcessing(userId: string, intentId: string): Promise<boolean> {
    return this.billingIntentRepository.claimForProcessing(userId, intentId);
  }

  async markDone(userId: string, intentId: string) {
    await this.billingIntentRepository.updateIntentStatus(intentId, BillingIntentStatus.DONE);
  }

  async markDoneWithSubscription(userId: string, intentId: string, subscriptionId: string) {
    await this.billingIntentRepository.updateIntentStatus(intentId, BillingIntentStatus.DONE, { subscriptionId });
  }

  async markFailed(userId: string, intentId: string) {
    await this.billingIntentRepository.updateIntentStatus(intentId, BillingIntentStatus.FAILED);
  }

  async markCanceled(userId: string, intentId: string) {
    await this.billingIntentRepository.updateIntentStatus(intentId, BillingIntentStatus.CANCELED);
  }

  async cancelLatestPendingOneShotIntent(userId: string) {
    await this.billingIntentRepository.cancelLatestPendingOneShotIntent(userId);
  }
}
