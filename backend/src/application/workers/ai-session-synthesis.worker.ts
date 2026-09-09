import crypto from 'node:crypto';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AiSessionSynthesisOutboxRepository } from '../ports/notes/ai-session-synthesis-outbox.repository.js';
import { AiSessionSynthesisGateway } from '../ports/notes/ai-session-synthesis.gateway.js';
import { NoteSynthesisRepository } from '../ports/notes/note-synthesis.repository.js';
import { ContentRepository } from '../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { AiEntitlementService } from '../services/ai/ai-entitlement.service.js';
import { EmbeddingQueuePublisher, EmbeddingJobType } from '../ports/notes/embedding-queue.publisher.js';
import { EmbeddingPriority } from '../../domain/enums/knowledge.enums.js';
import { AiOperationType } from '../../domain/enums/plans.enums.js';
import { IntegrationProvider } from '../../contracts/enums.js';
import type { NoteSynthesisItem } from '../models/note-synthesis.models.js';
import { AppLogger } from '../../observability/logger.js';
import { AI_SESSION_SYNTHESIS_PROCESSING, AI_SESSION_SYNTHESIS_QUEUE, AiSessionSynthesisErrorCode, AiSessionSynthesisJobStatus } from '../constants/ai-session-synthesis.constants.js';
import { buildDeterministicSynthesis, buildSynthesisTranscript, detectSynthesisLanguage, isDeterministicSynthesis, parseAiSessionTurns } from '../services/content/ai-session-synthesis-transcript.service.js';

@Injectable()
export class AiSessionSynthesisWorker implements OnModuleInit, OnModuleDestroy {
  private connection: any = null; private channel: any = null; private closed = false;
  constructor(
    private readonly outbox: AiSessionSynthesisOutboxRepository,
    private readonly gateway: AiSessionSynthesisGateway,
    private readonly syntheses: NoteSynthesisRepository,
    private readonly content: ContentRepository,
    private readonly environment: RuntimeEnvironmentProvider,
    private readonly entitlement: AiEntitlementService,
    private readonly embeddings: EmbeddingQueuePublisher,
    private readonly logger: AppLogger,
  ) {}

  async onModuleInit() {
    const url = String(process.env.KB_RABBITMQ_URL || '').trim();
    if (!url) { this.logger.info('ai_session_synthesis_worker.disabled'); return; }
    await this.connect(url).catch((error) => this.logger.error('ai_session_synthesis_worker.init_failed', { error: error instanceof Error ? error.message : String(error) }));
  }
  async onModuleDestroy() { this.closed = true; await this.channel?.close().catch(() => undefined); await this.connection?.close().catch(() => undefined); }
  private async connect(url: string) {
    const amqplib = await import('amqplib'); this.connection = await amqplib.connect(url);
    this.connection.on('close', () => { this.channel = null; if (!this.closed) setTimeout(() => void this.connect(url).catch(() => undefined), AI_SESSION_SYNTHESIS_PROCESSING.reconnectDelayMs); });
    const ch = await this.connection.createChannel(); await ch.prefetch(AI_SESSION_SYNTHESIS_PROCESSING.concurrency);
    await ch.assertExchange(AI_SESSION_SYNTHESIS_QUEUE.exchange, 'direct', { durable: true });
    await ch.assertQueue(AI_SESSION_SYNTHESIS_QUEUE.queue, { durable: true, arguments: { 'x-dead-letter-exchange': AI_SESSION_SYNTHESIS_QUEUE.deadLetterExchange } });
    await ch.bindQueue(AI_SESSION_SYNTHESIS_QUEUE.queue, AI_SESSION_SYNTHESIS_QUEUE.exchange, AI_SESSION_SYNTHESIS_QUEUE.routingKey);
    this.channel = ch;
    await ch.consume(AI_SESSION_SYNTHESIS_QUEUE.queue, (message: any) => { if (message) void this.handle(ch, message); });
    this.logger.info('ai_session_synthesis_worker.started', { concurrency: AI_SESSION_SYNTHESIS_PROCESSING.concurrency });
  }
  private async handle(ch: any, message: any) {
    try {
      const payload = JSON.parse(message.content.toString()) as { jobId?: string };
      if (!payload.jobId) throw new Error('invalid_job');
      await this.process(payload.jobId); ch.ack(message);
    } catch (error) { this.logger.error('ai_session_synthesis_worker.message_failed', { error: error instanceof Error ? error.message : String(error) }); ch.nack(message, false, false); }
  }
  private async process(jobId: string) {
    const job = await this.outbox.claim(jobId, AI_SESSION_SYNTHESIS_PROCESSING.leaseMs);
    if (!job) return; // duplicate delivery or a lease already owned by another consumer

    const startedAt = Date.now();
    try {
      await this.syntheses.markProcessing(job.userId, job.noteId, job.sourceHash);
      this.logger.info('ai_session_synthesis.processing_started', {
        jobId: job.id,
        noteId: job.noteId,
        workspaceSlug: job.workspaceSlug,
        attempt: job.attempts,
      });

      const note = await this.content.getNoteById(job.userId, job.noteId);
      if (!note || crypto.createHash('sha256').update(note.markdown || '').digest('hex') !== job.sourceHash) {
        await this.outbox.complete(job.id, AiSessionSynthesisJobStatus.Superseded);
        this.logger.info('ai_session_synthesis.superseded', { jobId: job.id, noteId: job.noteId, attempt: job.attempts });
        return;
      }

      const turns = parseAiSessionTurns(note.markdown || '');
      if (!turns.length || !await this.entitlement.isEnabled(job.userId, job.workspaceSlug, IntegrationProvider.AiSessionSynthesis)) {
        const reason = turns.length ? AiSessionSynthesisErrorCode.IntegrationDisabled : AiSessionSynthesisErrorCode.EmptyTranscript;
        await this.syntheses.markSkipped(job.userId, job.noteId, job.sourceHash, reason);
        await this.publishRaw(job.userId, job.noteId);
        await this.outbox.complete(job.id, AiSessionSynthesisJobStatus.Skipped, reason);
        this.logger.info('ai_session_synthesis.skipped', { jobId: job.id, noteId: job.noteId, attempt: job.attempts, reason });
        return;
      }

      const deterministic = isDeterministicSynthesis(turns, note.markdown || '');
      let overview: string; let memory: NoteSynthesisItem[]; let provider: string; let model: string;
      this.logger.info('ai_session_synthesis.generation_started', {
        jobId: job.id,
        noteId: job.noteId,
        attempt: job.attempts,
        mode: deterministic ? 'deterministic' : 'ai',
        turns: turns.length,
      });

      if (deterministic) {
        ({ overview, memory } = buildDeterministicSynthesis(turns)); provider = model = 'deterministic';
      } else {
        // Claiming this marker before billing makes retries harmless to credits.
        if (await this.outbox.markCharged(job.id)) {
          const quota = await this.entitlement.checkAndConsume({ userId: job.userId, workspaceSlug: job.workspaceSlug, provider: IntegrationProvider.AiSessionSynthesis, operation: AiOperationType.AI_SESSION_SYNTHESIS, metadata: { noteId: job.noteId, sessionId: note.sessionId } });
          if (!quota.enabled || !quota.quota.allowed) {
            await this.syntheses.markSkipped(job.userId, job.noteId, job.sourceHash, AiSessionSynthesisErrorCode.QuotaExceeded);
            await this.publishRaw(job.userId, job.noteId);
            await this.outbox.complete(job.id, AiSessionSynthesisJobStatus.Skipped, AiSessionSynthesisErrorCode.QuotaExceeded);
            this.logger.warn('ai_session_synthesis.skipped', { jobId: job.id, noteId: job.noteId, attempt: job.attempts, reason: AiSessionSynthesisErrorCode.QuotaExceeded });
            return;
          }
        }
        const env = this.environment.read(); const transcript = buildSynthesisTranscript(turns);
        const output = await this.gateway.generate({ provider: env.aiSessionSynthesisProvider, baseUrl: env.aiSessionSynthesisBaseUrl, model: env.aiSessionSynthesisModel, apiKey: env.aiSessionSynthesisApiKey }, transcript, detectSynthesisLanguage(transcript));
        overview = output.overview; memory = output.memory.map((item) => ({ ...item, turnRefs: item.turnRefs.filter((ref) => ref >= 1 && ref <= turns.length) })); provider = String(env.aiSessionSynthesisProvider); model = env.aiSessionSynthesisModel;
      }

      await this.syntheses.markCompleted({ userId: job.userId, noteId: job.noteId, sourceHash: job.sourceHash, mode: deterministic ? 'deterministic' : 'ai', overview, memory, provider, model });
      const current = await this.content.getNoteById(job.userId, job.noteId);
      if (current && crypto.createHash('sha256').update(current.markdown || '').digest('hex') === job.sourceHash) {
        await this.content.updateNoteSummary(job.userId, job.noteId, overview);
        await this.publishRaw(job.userId, job.noteId);
        await this.outbox.complete(job.id, AiSessionSynthesisJobStatus.Completed);
        this.logger.info('ai_session_synthesis.completed', { jobId: job.id, noteId: job.noteId, attempt: job.attempts, mode: deterministic ? 'deterministic' : 'ai', turns: turns.length, memoryItems: memory.length, durationMs: Date.now() - startedAt });
      } else {
        await this.outbox.complete(job.id, AiSessionSynthesisJobStatus.Superseded);
        this.logger.info('ai_session_synthesis.superseded', { jobId: job.id, noteId: job.noteId, attempt: job.attempts, stage: 'before_publish' });
      }
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 120) : AiSessionSynthesisErrorCode.GenerationFailed;
      const details = error as Error & {
        provider?: unknown;
        model?: string;
        endpoint?: string;
        status?: number;
        statusText?: string;
        responseBody?: string;
      };
      const provider = details.provider !== undefined ? String(details.provider) : undefined;
      if (job.attempts >= AI_SESSION_SYNTHESIS_PROCESSING.retryDelaysMs.length) {
        await this.syntheses.markFailed(job.userId, job.noteId, job.sourceHash, code);
        await this.publishRaw(job.userId, job.noteId);
        await this.outbox.complete(job.id, AiSessionSynthesisJobStatus.Failed, code);
        this.logger.error('ai_session_synthesis.failed', {
          jobId: job.id,
          noteId: job.noteId,
          attempt: job.attempts,
          error: code,
          provider,
          model: details.model,
          endpoint: details.endpoint,
          errorStatus: details.status,
          errorStatusText: details.statusText,
          errorResponseBody: details.responseBody,
          durationMs: Date.now() - startedAt,
        });
      } else {
        const retryDelayMs = AI_SESSION_SYNTHESIS_PROCESSING.retryDelaysMs[job.attempts - 1] || AI_SESSION_SYNTHESIS_PROCESSING.retryDelaysMs[0];
        await this.outbox.retry(job.id, retryDelayMs, code);
        this.logger.warn('ai_session_synthesis.retry_scheduled', {
          jobId: job.id,
          noteId: job.noteId,
          attempt: job.attempts,
          retryDelayMs,
          error: code,
          provider,
          model: details.model,
          endpoint: details.endpoint,
          errorStatus: details.status,
          errorStatusText: details.statusText,
          errorResponseBody: details.responseBody,
        });
      }
    }
  }
  private async publishRaw(userId: string, noteId: string) { await this.embeddings.publish({ type: EmbeddingJobType.Index, userId, noteId, priority: EmbeddingPriority.Low }); }
}
