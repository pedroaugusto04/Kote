import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

import { EmbeddingGateway } from '../ports/embedding.gateway.js';
import { NoteEmbeddingRepository } from '../ports/note-embedding.repository.js';
import { RuntimeEnvironmentProvider } from '../ports/runtime-environment.port.js';
import { ContentRepository } from '../ports/content.repository.js';
import { EmbeddingJobType, type EmbeddingJobPayload } from '../ports/embedding-queue.publisher.js';
import { NoteChunkingService } from './note-chunking.service.js';
import { AppLogger } from '../../observability/logger.js';

const EXCHANGE_NAME = 'kb.embedding';
const QUEUE_NAME = 'kb.embedding.jobs';
const ROUTING_KEY = 'embedding.job';

/**
 * Max number of unacknowledged messages the worker will pull at once.
 */
const PREFETCH_COUNT = 5;

/**
 * Maximum number of times a message will be retried before being dead-lettered.
 */
const MAX_RETRIES = 3;

/**
 * Delay before attempting to reconnect after a connection loss.
 */
const RECONNECT_DELAY_MS = 5_000;

@Injectable()
export class EmbeddingWorker implements OnModuleInit, OnModuleDestroy {
  // Using 'any' for amqplib types — the package is loaded dynamically at
  // runtime and @types/amqplib may not be installed in all environments.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private connection: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private channel: any = null;
  private closed = false;

  constructor(
    private readonly embeddingGateway: EmbeddingGateway,
    private readonly noteEmbeddingRepository: NoteEmbeddingRepository,
    private readonly contentRepository: ContentRepository,
    private readonly chunkingService: NoteChunkingService,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async onModuleInit() {
    if (!this.shouldStart()) {
      this.logger.info('embedding_worker.disabled');
      return;
    }

    try {
      await this.connect();
    } catch (error) {
      this.logger.error('embedding_worker.init_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async onModuleDestroy() {
    this.closed = true;
    try { await this.channel?.close(); } catch { /* ignore */ }
    try { await this.connection?.close(); } catch { /* ignore */ }
    this.channel = null;
    this.connection = null;
    this.logger.info('embedding_worker.stopped');
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  private async connect() {
    const url = this.getRabbitMqUrl();
    if (!url) {
      this.logger.warn('embedding_worker.no_rabbitmq_url');
      return;
    }

    const amqpModuleName = 'amqplib';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const amqplib: any = await import(amqpModuleName);
    const conn = await amqplib.connect(url);
    this.connection = conn;

    conn.on('error', (err: Error) => {
      this.logger.error('embedding_worker.connection_error', { error: err.message });
      this.channel = null;
    });
    conn.on('close', () => {
      this.channel = null;
      if (!this.closed) {
        this.logger.warn('embedding_worker.connection_closed_reconnecting');
        setTimeout(() => void this.reconnect(), RECONNECT_DELAY_MS);
      }
    });

    const ch = await conn.createChannel();
    await ch.prefetch(PREFETCH_COUNT);

    // Assert exchange + queue (idempotent — matches publisher assertions)
    await ch.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
    await ch.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': `${EXCHANGE_NAME}.dlx` },
    });
    await ch.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY);

    this.channel = ch;

    // Start consuming
    await ch.consume(QUEUE_NAME, (msg: any) => {
      if (!msg) return;
      void this.handleMessage(ch, msg);
    });

    this.logger.info('embedding_worker.started', {
      url: url.replace(/\/\/[^@]*@/, '//***@'),
      prefetch: PREFETCH_COUNT,
    });
  }

  private async reconnect() {
    if (this.closed) return;
    try {
      await this.connect();
    } catch (error) {
      this.logger.error('embedding_worker.reconnect_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Retry again after delay
      setTimeout(() => void this.reconnect(), RECONNECT_DELAY_MS);
    }
  }

  // ---------------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleMessage(ch: any, msg: any) {
    const startMs = Date.now();
    let job: EmbeddingJobPayload;

    try {
      job = JSON.parse(msg.content.toString()) as EmbeddingJobPayload;
    } catch {
      this.logger.error('embedding_worker.invalid_message', {
        content: msg.content.toString().slice(0, 200),
      });
      ch.nack(msg, false, false); // don't requeue malformed messages
      return;
    }

    try {
      switch (job.type) {
        case EmbeddingJobType.Index:
          await this.processIndex(job.userId, job.noteId);
          break;
        case EmbeddingJobType.Delete:
          await this.processDelete(job.userId, job.noteId);
          break;
        case EmbeddingJobType.ReindexAll:
          await this.processReindexAll(job.userId);
          break;
        default:
          this.logger.warn('embedding_worker.unknown_job_type', { job });
      }

      ch.ack(msg);

      this.logger.info('embedding_worker.job_completed', {
        type: job.type,
        durationMs: Date.now() - startMs,
      });
    } catch (error) {
      const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;

      this.logger.error('embedding_worker.job_failed', {
        type: job.type,
        retryCount,
        error: error instanceof Error ? error.message : String(error),
      });

      if (retryCount >= MAX_RETRIES) {
        // Dead-letter after max retries
        ch.nack(msg, false, false);
        this.logger.warn('embedding_worker.job_dead_lettered', {
          type: job.type,
          retryCount,
        });
      } else {
        // Republish with incremented retry count (manual retry approach)
        ch.ack(msg);
        ch.publish(
          EXCHANGE_NAME,
          ROUTING_KEY,
          Buffer.from(JSON.stringify(job)),
          {
            persistent: true,
            contentType: 'application/json',
            headers: { 'x-retry-count': retryCount + 1 },
          },
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Job processors
  // ---------------------------------------------------------------------------

  private async processIndex(userId: string, noteId: string) {
    const note = await this.contentRepository.getNoteById(userId, noteId);
    if (!note) {
      this.logger.warn('embedding_worker.note_not_found', { noteId });
      // Note was deleted between publish and consume — clean up any stale embeddings
      await this.noteEmbeddingRepository.deleteByNoteId(userId, noteId);
      return;
    }

    const env = this.runtimeEnv.read();
    const embeddingConfig = {
      provider: env.embeddingAiProvider,
      baseUrl: env.embeddingAiBaseUrl,
      model: env.embeddingAiModel,
      apiKey: env.embeddingAiApiKey,
    };

    const chunks = this.chunkingService.chunkNote({
      title: note.title,
      body: note.markdown,
      projectSlug: note.projectSlug,
    });

    if (chunks.length === 0) {
      // No meaningful content — delete any stale embeddings
      await this.noteEmbeddingRepository.deleteByNoteId(userId, noteId);
      return;
    }

    const texts = chunks.map((c) => c.chunkText);
    const embeddings = await this.embeddingGateway.generateEmbeddings(embeddingConfig, texts);

    if (embeddings.length === 0) {
      this.logger.warn('embedding_worker.no_embeddings_generated', { noteId });
      return;
    }

    const records = chunks.map((chunk, i) => ({
      userId,
      noteId,
      chunkIndex: chunk.chunkIndex,
      chunkText: chunk.chunkText,
      embedding: embeddings[i],
      model: env.embeddingAiModel,
    }));

    await this.noteEmbeddingRepository.upsertChunks(userId, noteId, records);

    this.logger.info('embedding_worker.indexed', {
      noteId,
      chunksCount: chunks.length,
    });
  }

  private async processDelete(userId: string, noteId: string) {
    await this.noteEmbeddingRepository.deleteByNoteId(userId, noteId);
    this.logger.info('embedding_worker.deleted_embeddings', { noteId });
  }

  private async processReindexAll(userId: string) {
    const notes = await this.contentRepository.listNotes(userId);

    this.logger.info('embedding_worker.reindex_all_started', {
      userId,
      totalNotes: notes.length,
    });

    let indexed = 0;
    let failed = 0;

    for (const note of notes) {
      try {
        await this.processIndex(userId, note.id);
        indexed++;
      } catch (error) {
        failed++;
        this.logger.error('embedding_worker.reindex_note_failed', {
          noteId: note.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('embedding_worker.reindex_all_completed', {
      userId,
      indexed,
      failed,
      total: notes.length,
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private shouldStart(): boolean {
    const env = this.runtimeEnv.read();
    if (env.disableEmbeddingWorker) return false;
    if (!env.embeddingAiApiKey) return false;
    return Boolean(this.getRabbitMqUrl());
  }

  private getRabbitMqUrl(): string {
    return String(process.env.KB_RABBITMQ_URL || '').trim();
  }
}
