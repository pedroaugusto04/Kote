import { schedule } from 'node-cron';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SubscriptionChangeService } from '../application/services/billing/SubscriptionChangeService.js';
import { SubscriptionService } from '../application/services/billing/SubscriptionService.js';
import { AppLogger } from '../observability/logger.js';
import { eq, and, lt } from 'drizzle-orm';
import { PostgresDatabase } from '../infrastructure/persistence/database.js';
import { subscriptionChangeRequests, userSubscriptions } from '../infrastructure/persistence/schema/index.js';
import { SubscriptionChangeStatus, SubscriptionChangeType } from '../domain/enums/billing.enums.js';

const CHANGE_SUBSCRIPTION_WORKER_AUTORUN = (() => {
  const raw = process.env.CHANGE_SUBSCRIPTION_WORKER_AUTORUN;
  if (!raw) return false;
  return raw === 'true' || raw === '1';
})();

@Injectable()
export class ChangeSubscriptionWorker implements OnModuleInit, OnModuleDestroy {
  private cronTask: any;

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly subscriptionChangeService: SubscriptionChangeService,
    private readonly database: PostgresDatabase,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit() {
    this.startChangeSubscriptionWorker();
  }

  onModuleDestroy() {
    if (this.cronTask) {
      this.cronTask.stop();
    }
  }

  async startChangeSubscriptionWorker() {
    this.logger.info('[worker] change subscription worker started');
    this.logger.info(`[worker] CHANGE_SUBSCRIPTION_WORKER_AUTORUN=${CHANGE_SUBSCRIPTION_WORKER_AUTORUN}`);

    this.cronTask = schedule(
      '10 0 * * *', // todo dia 00:10 (America/Sao_Paulo)
      async () => {
        await this.runChangeSubscriptionJob();
      },
      { timezone: 'America/Sao_Paulo' },
    );

    this.logger.info('[worker] cron agendado para 00:10 (America/Sao_Paulo)');

    // Executa imediatamente se a flag for true (util para desenvolvimento)
    if (CHANGE_SUBSCRIPTION_WORKER_AUTORUN) {
      this.logger.info('[worker] autorun habilitado — executando job imediatamente');
      await this.runChangeSubscriptionJob();
    } else {
      this.logger.info('[worker] autorun desabilitado — aguardando horário agendado');
    }
  }

  async runChangeSubscriptionJob() {
    this.logger.info('[worker] Executando job de mudanca de assinaturas...');

    const subscriptionsDowngradesChanges = await this.getEffectiveDowngrades();

    for (const subscriptionDowngradeChange of subscriptionsDowngradesChanges) {
      let shouldIncrementAttempts = true;
      try {
        if (await this.shouldCancelMissedScheduledChange(subscriptionDowngradeChange)) {
          await this.subscriptionChangeService.setCanceled(subscriptionDowngradeChange.userId, subscriptionDowngradeChange.id);
          shouldIncrementAttempts = false;
          this.logger.warn(
            `[worker] mudança agendada cancelada por janela perdida (downgrade): change=${subscriptionDowngradeChange.id} sub=${subscriptionDowngradeChange.fromSubscriptionId} userId=${subscriptionDowngradeChange.userId}`,
          );
          continue;
        }

        this.logger.info(
          `[worker] inicia downgrade de assinatura: sub=${subscriptionDowngradeChange.fromSubscriptionId} para plan=${subscriptionDowngradeChange.toPlanId} userId=${subscriptionDowngradeChange.userId}`,
        );

        // tenta realizar o downgrade da assinatura
        await this.subscriptionChangeService.applyScheduledChange(subscriptionDowngradeChange.id);
        
        this.logger.info(
          `[worker] assinatura downgraded: sub=${subscriptionDowngradeChange.fromSubscriptionId} para plan=${subscriptionDowngradeChange.toPlanId} userId=${subscriptionDowngradeChange.userId}`,
        );
      } catch (error) {
        this.logger.error(`[worker] Falha ao realizar downgrade da assinatura: sub=${subscriptionDowngradeChange.fromSubscriptionId} para plan=${subscriptionDowngradeChange.toPlanId} userId=${subscriptionDowngradeChange.userId}`, { error: error instanceof Error ? error.message : String(error) });
      } finally {
        if (shouldIncrementAttempts) {
          try {
            // incrementa o numero de tentativas ( evita reprocessamento de mudanças com falha indefinidamente )
            await this.subscriptionChangeService.incrementAttempts(subscriptionDowngradeChange.userId, subscriptionDowngradeChange.id);
          } catch (incError) {
            this.logger.error(`[worker] Falha ao incrementar tentativas: change=${subscriptionDowngradeChange.id}`, { error: incError instanceof Error ? incError.message : String(incError) });
          }
        }
      }
    }

    const subscriptionsCycleChanges = await this.getEffectiveCycleChanges();

    for (const subscriptionCycleChange of subscriptionsCycleChanges) {
      let shouldIncrementAttempts = true;
      try {
        if (await this.shouldCancelMissedScheduledChange(subscriptionCycleChange)) {
          await this.subscriptionChangeService.setCanceled(subscriptionCycleChange.userId, subscriptionCycleChange.id);
          shouldIncrementAttempts = false;
          this.logger.warn(
            `[worker] mudança agendada cancelada por janela perdida (change_cycle): change=${subscriptionCycleChange.id} sub=${subscriptionCycleChange.fromSubscriptionId} userId=${subscriptionCycleChange.userId}`,
          );
          continue;
        }

        this.logger.info(
          `[worker] inicia mudanca de ciclo de assinatura: sub=${subscriptionCycleChange.fromSubscriptionId} para cycle=${subscriptionCycleChange.toBillingCycle} userId=${subscriptionCycleChange.userId}`,
        );

        // tenta realizar a mudanca de ciclo da assinatura
        await this.subscriptionChangeService.applyScheduledChange(subscriptionCycleChange.id);
        
        this.logger.info(
          `[worker] ciclo da assinatura alterado: sub=${subscriptionCycleChange.fromSubscriptionId} para cycle=${subscriptionCycleChange.toBillingCycle} userId=${subscriptionCycleChange.userId}`,
        );
      } catch (error) {
        this.logger.error(`[worker] Falha ao realizar mudanca de ciclo da assinatura: sub=${subscriptionCycleChange.fromSubscriptionId} para cycle=${subscriptionCycleChange.toBillingCycle} userId=${subscriptionCycleChange.userId}`, { error: error instanceof Error ? error.message : String(error) });
      } finally {
        if (shouldIncrementAttempts) {
          try {
            // incrementa o numero de tentativas ( evita reprocessamento de mudanças com falha indefinidamente )
            await this.subscriptionChangeService.incrementAttempts(subscriptionCycleChange.userId, subscriptionCycleChange.id);
          } catch (incError) {
            this.logger.error(`[worker] Falha ao incrementar tentativas: change=${subscriptionCycleChange.id}`, { error: incError instanceof Error ? incError.message : String(incError) });
          }
        }
      }
    }

    this.logger.info('[worker] Job de mudanca de assinaturas finalizado');
  }

  private async getEffectiveDowngrades() {
    const db = this.database.getDb();
    const now = new Date();
    return await db
      .select()
      .from(subscriptionChangeRequests)
      .where(and(
        eq(subscriptionChangeRequests.type, SubscriptionChangeType.DOWNGRADE as any),
        eq(subscriptionChangeRequests.status, SubscriptionChangeStatus.SCHEDULED as any),
        lt(subscriptionChangeRequests.effectiveAt, now),
        lt(subscriptionChangeRequests.attempts, 10),
      ))
      .limit(100);
  }

  private async getEffectiveCycleChanges() {
    const db = this.database.getDb();
    const now = new Date();
    return await db
      .select()
      .from(subscriptionChangeRequests)
      .where(and(
        eq(subscriptionChangeRequests.type, SubscriptionChangeType.CHANGE_CYCLE as any),
        eq(subscriptionChangeRequests.status, SubscriptionChangeStatus.SCHEDULED as any),
        lt(subscriptionChangeRequests.effectiveAt, now),
        lt(subscriptionChangeRequests.attempts, 10),
      ))
      .limit(100);
  }

  private async shouldCancelMissedScheduledChange(
    scheduledChange: { fromSubscriptionId: string; effectiveAt?: Date | string | null }
  ): Promise<boolean> {
    const effectiveAt = this.normalizeDate(scheduledChange.effectiveAt);
    if (!effectiveAt) return false;

    // effectiveAt é D-1. Se a assinatura já avançou para vencimento > D, a cobrança do ciclo foi gerada sem aplicar a mudança.
    const expectedDueDate = new Date(effectiveAt);
    expectedDueDate.setDate(expectedDueDate.getDate() + 1);

    const db = this.database.getDb();
    const subscription = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, scheduledChange.fromSubscriptionId))
      .limit(1)
      .then(r => r[0] || null);
    
    const currentNextDueDate = this.normalizeDate(subscription?.nextDueDate);
    if (!currentNextDueDate) return false;

    return currentNextDueDate > expectedDueDate;
  }

  private normalizeDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  }
}
