import { schedule } from 'node-cron';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SubscriptionCancellationService } from '../services/billing/SubscriptionCancellationService.js';
import { AppLogger } from '../../observability/logger.js';
import { eq, and, lt } from 'drizzle-orm';
import { PostgresDatabase } from '../../infrastructure/persistence/database.js';
import { userSubscriptions } from '../../infrastructure/persistence/schema/index.js';
import { SubscriptionStatus } from '../../domain/enums/billing.enums.js';

const BILLING_WORKER_AUTORUN = (() => {
  const raw = process.env.BILLING_WORKER_AUTORUN;
  if (!raw) return false;
  return raw === 'true' || raw === '1';
})();

const MAX_DAYS_PAST_DUE = (() => {
  const raw = process.env.MAX_DAYS_PAST_DUE;
  if (!raw) return 7;

  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`MAX_DAYS_PAST_DUE inválido: ${raw}`);
  }
  return n;
})();

@Injectable()
export class BillingWorker implements OnModuleInit, OnModuleDestroy {
  private cronTask: any;

  constructor(
    private readonly subscriptionCancellationService: SubscriptionCancellationService,
    private readonly database: PostgresDatabase,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit() {
    this.startBillingWorker();
  }

  onModuleDestroy() {
    if (this.cronTask) {
      this.cronTask.stop();
    }
  }

  async startBillingWorker() {
    this.logger.info('[worker] billing worker started');
    this.logger.info(`[worker] MAX_DAYS_PAST_DUE=${MAX_DAYS_PAST_DUE}`);
    this.logger.info(`[worker] BILLING_WORKER_AUTORUN=${BILLING_WORKER_AUTORUN}`);

    this.cronTask = schedule(
      '05 0 * * *', // todo dia 00:05 (America/Sao_Paulo)
      async () => {
        await this.runPastDueJob();
      },
      { timezone: 'America/Sao_Paulo' },
    );

    this.logger.info('[worker] cron agendado para 00:05 (America/Sao_Paulo)');

    // Executa imediatamente se a flag for true (util para desenvolvimento)
    if (BILLING_WORKER_AUTORUN) {
      this.logger.info('[worker] autorun habilitado — executando job imediatamente');
      await this.runPastDueJob();
    } else {
      this.logger.info('[worker] autorun desabilitado — aguardando horário agendado');
    }
  }

  async runPastDueJob() {
    this.logger.info('[worker] Executando job de cancelamento de assinaturas PAST_DUE alem do prazo...');

    const subscriptionsToCancel = await this.findPastDueOlderThan(MAX_DAYS_PAST_DUE);

    for (const sub of subscriptionsToCancel) {
      try {
        this.logger.info(
          `[worker] inicia cancelamento da assinatura: sub=${sub.userId} userId=${sub.userId}`,
        );
        // cancela a assinatura
        await this.subscriptionCancellationService.cancelSubscription(sub.userId);
        this.logger.info(
          `[worker] assinatura cancelada: sub=${sub.userId} userId=${sub.userId}`,
        );
      } catch (error) {
        this.logger.error(`[worker] Falha ao cancelar assinatura: sub=${sub.userId} userId=${sub.userId}`, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    this.logger.info('[worker] Job de cancelamento de assinaturas PAST_DUE finalizado');
  }

  private async findPastDueOlderThan(maxDays: number): Promise<Array<{ userId: string; status: string; updatedAt: Date }>> {
    const db = this.database.getDb();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxDays);

    return await db
      .select()
      .from(userSubscriptions)
      .where(and(
        eq(userSubscriptions.status, SubscriptionStatus.PAST_DUE as any),
        lt(userSubscriptions.pastDueAt, cutoffDate)
      ))
      .limit(100);
  }
}
