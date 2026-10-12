import { schedule } from 'node-cron';
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { BillingWebhookEventRepository } from '../ports/billing/billing-repositories.js';
import { BillingQueuePublisher } from '../ports/billing/billing-queue.publisher.js';
import { AppLogger } from '../../observability/logger.js';

const WEBHOOK_OUTBOX_RELAY_AUTORUN = (() => {
  const raw = process.env.WEBHOOK_OUTBOX_RELAY_AUTORUN;
  if (!raw) return false;
  return raw === 'true' || raw === '1';
})();

const WEBHOOK_OUTBOX_RELAY_CRON = process.env.WEBHOOK_OUTBOX_RELAY_CRON ?? '*/1 * * * *';
const WEBHOOK_OUTBOX_RELAY_TIMEZONE = process.env.WEBHOOK_OUTBOX_RELAY_TIMEZONE ?? 'America/Sao_Paulo';
const WEBHOOK_OUTBOX_RELAY_BATCH_SIZE = Number(process.env.WEBHOOK_OUTBOX_RELAY_BATCH_SIZE ?? '100');
const WEBHOOK_OUTBOX_RELAY_MIN_AGE_SECONDS = Number(process.env.WEBHOOK_OUTBOX_RELAY_MIN_AGE_SECONDS ?? '30');
const WEBHOOK_OUTBOX_RELAY_MAX_ATTEMPTS = Number(process.env.WEBHOOK_OUTBOX_RELAY_MAX_ATTEMPTS ?? '10');
const OUTBOX_ALERT_MARKER = '[OUTBOX_ATTEMPT_LIMIT_ALERT_SENT]';
const DEV_EMAIL = process.env.DEV_EMAIL?.trim();

@Injectable()
export class WebhookOutboxRelayWorker implements OnModuleInit, OnModuleDestroy {
  private cronTask: any;

  constructor(
    private readonly billingWebhookEventRepository: BillingWebhookEventRepository,
    private readonly billingQueuePublisher: BillingQueuePublisher,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit() {
    this.startWebhookOutboxRelayWorker();
  }

  onModuleDestroy() {
    if (this.cronTask) {
      this.cronTask.stop();
    }
  }

  async startWebhookOutboxRelayWorker() {
    this.logger.info('[worker] webhook outbox relay started');
    this.logger.info(`[worker] WEBHOOK_OUTBOX_RELAY_CRON=${WEBHOOK_OUTBOX_RELAY_CRON}`);
    this.logger.info(`[worker] WEBHOOK_OUTBOX_RELAY_AUTORUN=${WEBHOOK_OUTBOX_RELAY_AUTORUN}`);
    this.logger.info(`[worker] WEBHOOK_OUTBOX_RELAY_BATCH_SIZE=${WEBHOOK_OUTBOX_RELAY_BATCH_SIZE}`);
    this.logger.info(`[worker] WEBHOOK_OUTBOX_RELAY_MIN_AGE_SECONDS=${WEBHOOK_OUTBOX_RELAY_MIN_AGE_SECONDS}`);
    this.logger.info(`[worker] WEBHOOK_OUTBOX_RELAY_MAX_ATTEMPTS=${WEBHOOK_OUTBOX_RELAY_MAX_ATTEMPTS}`);

    this.cronTask = schedule(
      WEBHOOK_OUTBOX_RELAY_CRON,
      async () => {
        await this.runWebhookOutboxRelayJob();
      },
      { timezone: WEBHOOK_OUTBOX_RELAY_TIMEZONE },
    );

    this.logger.info(
      `[worker] cron agendado para replay de webhook outbox (${WEBHOOK_OUTBOX_RELAY_CRON}, tz=${WEBHOOK_OUTBOX_RELAY_TIMEZONE})`
    );

    if (WEBHOOK_OUTBOX_RELAY_AUTORUN) {
      this.logger.info('[worker] autorun habilitado - executando replay imediatamente');
      await this.runWebhookOutboxRelayJob();
    } else {
      this.logger.info('[worker] autorun desabilitado - aguardando proxima execucao agendada');
    }
  }

  async runWebhookOutboxRelayJob() {
    this.logger.info('[worker] Executando replay de eventos de webhook pendentes/falhos...');

    const events = await this.listWebhookEventsForReplay();

    if (!events.length) {
      this.logger.info('[worker] Nenhum evento elegivel para replay');
    } else {
      for (const event of events) {
        try {
          await this.billingQueuePublisher.publishWebhookEventId(event.id);
          await this.markWebhookEventDispatched(event.id);
          this.logger.info(
            `[worker] replay publicado: webhookEventId=${event.id} status=${event.status} attempts=${event.attempts}`
          );
        } catch (error) {
          this.logger.error(`[worker] Falha ao republicar webhookEventId=${event.id}`, { error: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    await this.notifyAttemptLimitReached();
  }

  private async listWebhookEventsForReplay() {
    return this.billingWebhookEventRepository.listWebhookEventsForReplay({
      minAgeSeconds: WEBHOOK_OUTBOX_RELAY_MIN_AGE_SECONDS,
      maxAttempts: WEBHOOK_OUTBOX_RELAY_MAX_ATTEMPTS,
      batchSize: WEBHOOK_OUTBOX_RELAY_BATCH_SIZE,
    });
  }

  private async markWebhookEventDispatched(eventId: string) {
    await this.billingWebhookEventRepository.markWebhookEventDispatched(eventId);
  }

  private async notifyAttemptLimitReached() {
    const exhaustedEvents = await this.listWebhookEventsAtAttemptLimit();

    if (!exhaustedEvents.length) return;

    if (!DEV_EMAIL) {
      this.logger.warn('[worker] DEV_EMAIL não configurado; não foi possível enviar alerta de limite de tentativas do outbox');
      return;
    }

    const subject = `[ALERTA][Billing] Webhook(s) sem processamento após ${WEBHOOK_OUTBOX_RELAY_MAX_ATTEMPTS} tentativas`;
    const textLines = exhaustedEvents.map((event) =>
      `eventId=${event.id} eventType=${event.eventType} gatewayPaymentId=${event.gatewayPaymentId ?? 'n/a'} attempts=${event.attempts} updatedAt=${event.updatedAt}`
    );

    // TODO: Implementar envio de email quando serviço de email estiver disponível
    this.logger.warn(
      `[worker] alerta seria enviado para ${DEV_EMAIL}; eventos com limite excedido: ${exhaustedEvents.map((event) => event.id).join(', ')}`
    );

    for (const event of exhaustedEvents) {
      await this.markWebhookEventAlerted(event.id);
    }
  }

  private async listWebhookEventsAtAttemptLimit() {
    return this.billingWebhookEventRepository.listWebhookEventsAtAttemptLimit({
      maxAttempts: WEBHOOK_OUTBOX_RELAY_MAX_ATTEMPTS,
      batchSize: WEBHOOK_OUTBOX_RELAY_BATCH_SIZE,
      alertMarker: OUTBOX_ALERT_MARKER,
    });
  }

  private async markWebhookEventAlerted(eventId: string) {
    await this.billingWebhookEventRepository.markWebhookEventAlerted(eventId, OUTBOX_ALERT_MARKER);
  }
}
