import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

import { EmbeddingGateway } from '../ports/notes/embedding.gateway.js';
import { NoteEmbeddingRepository } from '../ports/notes/note-embedding.repository.js';
import { RuntimeEnvironmentProvider } from '../ports/observability/runtime-environment.port.js';
import { ContentRepository } from '../ports/notes/content.repository.js';
import { ObjectStorage } from '../ports/notes/object-storage.js';
import { EmbeddingJobType, type EmbeddingJobPayload } from '../ports/notes/embedding-queue.publisher.js';
import { NoteChunkingService } from '../services/content/note-chunking.service.js';
import type { NoteChunkAttachment } from '../models/note-chunk.models.js';
import { resolveAttachmentTextContent } from '../../domain/utils/attachment.utils.js';
import type { AttachmentRecord } from '../models/repository-records.models.js';
import { resolveNoteBodySearchText } from '../../domain/utils/note-search-text.utils.js';
import { AppLogger } from '../../observability/logger.js';

const EXCHANGE_NAME = 'kb.embedding';
const LOW_PRIORITY_QUEUE = 'kb.embedding.low';
const LOW_PRIORITY_ROUTING_KEY = 'embedding.low';

/**
 * Max number of unacknowledged messages the low priority worker will pull at once.
 */
const PREFETCH_COUNT = 4;

/**
 * Maximum number of times a message will be retried before being dead-lettered.
 */
const MAX_RETRIES = 3;

/**
 * Delay before attempting to reconnect after a connection loss.
 */
const RECONNECT_DELAY_MS = 5_000;

@Injectable()
export class LowPriorityEmbeddingWorker implements OnModuleInit, OnModuleDestroy {
  private connection: any = null;
  private channel: any = null;
  private closed = false;

  constructor(
    private readonly embeddingGateway: EmbeddingGateway,
    private readonly noteEmbeddingRepository: NoteEmbeddingRepository,
    private readonly contentRepository: ContentRepository,
    private readonly chunkingService: NoteChunkingService,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
    private readonly objectStorage: ObjectStorage,
  ) {}

  async onModuleInit() {
    if (!this.shouldStart()) {
      this.logger.info('low_priority_embedding_worker.disabled');
      return;
    }

    await this.connect();
  }

  async onModuleDestroy() {
    this.closed = true;
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }

  private shouldStart(): boolean {
    const env = this.runtimeEnv.read();
    if (env.disableEmbeddingWorker) return false;
    if (!env.embeddingAiApiKey) return false;
    return Boolean(this.getRabbitMqUrl());
  }

  private getRabbitMqUrl(): string {
    return String(process.env.KB_RABBITMQ_URL || '').trim();
  }

  private async connect() {
    const url = this.getRabbitMqUrl();
    if (!url) {
      this.logger.warn('low_priority_embedding_worker.no_url');
      return;
    }

    const amqplib = await import('amqplib');
    const conn = await amqplib.connect(url);

    conn.on('error', (error: any) => {
      this.logger.error('low_priority_embedding_worker.connection_error', {
        error: error.message,
      });
    });

    conn.on('close', () => {
      this.channel = null;
      if (!this.closed) {
        this.logger.warn('low_priority_embedding_worker.connection_closed_reconnecting');
        setTimeout(() => void this.reconnect(), RECONNECT_DELAY_MS);
      }
    });

    const ch = await conn.createChannel();
    await ch.prefetch(PREFETCH_COUNT);

    // Assert exchange + low priority queue
    await ch.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
    await ch.assertQueue(LOW_PRIORITY_QUEUE, {
      durable: true,
      arguments: { 'x-max-priority': 5, 'x-dead-letter-exchange': `${EXCHANGE_NAME}.dlx` },
    });
    await ch.bindQueue(LOW_PRIORITY_QUEUE, EXCHANGE_NAME, LOW_PRIORITY_ROUTING_KEY);

    this.channel = ch;

    // Start consuming only low priority queue
    await ch.consume(LOW_PRIORITY_QUEUE, (msg: any) => {
      if (!msg) return;
      void this.handleMessage(ch, msg);
    });

    this.logger.info('low_priority_embedding_worker.started', {
      url: url.replace(/\/\/[^@]*@/, '//***@'),
      prefetch: PREFETCH_COUNT,
    });
  }

  private async reconnect() {
    if (this.closed) return;
    try {
      await this.connect();
    } catch (error) {
      this.logger.error('low_priority_embedding_worker.reconnect_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      setTimeout(() => void this.reconnect(), RECONNECT_DELAY_MS);
    }
  }

  private async handleMessage(ch: any, msg: any) {
    const startMs = Date.now();
    const job = JSON.parse(msg.content.toString()) as EmbeddingJobPayload;

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
          this.logger.warn('low_priority_embedding_worker.unexpected_job_type', { job });
          ch.ack(msg);
      }

      ch.ack(msg);

      this.logger.info('low_priority_embedding_worker.job_completed', {
        type: job.type,
        durationMs: Date.now() - startMs,
      });
    } catch (error) {
      this.logger.error('low_priority_embedding_worker.job_failed', {
        type: job.type,
        error: error instanceof Error ? error.message : String(error),
      });

      const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;
      if (retryCount >= MAX_RETRIES) {
        ch.nack(msg, false, false);
        this.logger.warn('low_priority_embedding_worker.job_dead_lettered', {
          type: job.type,
          retryCount,
        });
      } else {
        ch.ack(msg);
        ch.publish(
          EXCHANGE_NAME,
          LOW_PRIORITY_ROUTING_KEY,
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

  private async processIndex(userId: string, noteId: string) {
    const note = await this.contentRepository.getNoteById(userId, noteId);
    if (!note) {
      this.logger.warn('low_priority_embedding_worker.note_not_found', { noteId });
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
    const attachments = await this.contentRepository.listAttachments(userId, noteId);

    this.logger.info('low_priority_embedding_worker.attachments_found', {
      noteId,
      count: attachments.length,
      files: attachments.map((a) => ({ fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, hasStorageKey: Boolean(a.storageKey) })),
    });

    const processedAttachments: NoteChunkAttachment[] = await Promise.all(
      attachments.map(async (attachment: AttachmentRecord) => ({
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        content: await resolveAttachmentTextContent(attachment, this.objectStorage, this.logger, 'low_priority_embedding_worker', noteId),
      })),
    );

    const chunks = this.chunkingService.chunkNote({
      title: note.title,
      body: note.markdown,
      projectSlug: note.projectSlug || '',
      path: note.path || '',
      attachments: processedAttachments,
    });

    const existingEmbeddings = await this.noteEmbeddingRepository.getNoteEmbeddings(userId, noteId);
    const textToEmbeddingMap = new Map<string, number[]>();
    for (const rec of existingEmbeddings) {
      if (rec.model === env.embeddingAiModel && Array.isArray(rec.embedding) && rec.embedding.length > 0) {
        textToEmbeddingMap.set(rec.chunkText, rec.embedding);
      }
    }

    const textsToEmbed: string[] = [];
    const chunkEmbeddings: (number[] | null)[] = [];

    for (const chunk of chunks) {
      const existing = textToEmbeddingMap.get(chunk.chunkText);
      if (existing) {
        chunkEmbeddings.push(existing);
      } else {
        chunkEmbeddings.push(null);
        textsToEmbed.push(chunk.chunkText);
      }
    }

    let generatedEmbeddings: number[][] = [];
    if (textsToEmbed.length > 0) {
      generatedEmbeddings = await this.embeddingGateway.generateEmbeddings(embeddingConfig, textsToEmbed);
      if (generatedEmbeddings.length !== textsToEmbed.length) {
        this.logger.warn('low_priority_embedding_worker.embeddings_count_mismatch', {
          noteId,
          expected: textsToEmbed.length,
          received: generatedEmbeddings.length,
        });
        return;
      }
    }

    let genIndex = 0;
    const finalEmbeddings: number[][] = [];
    for (const emb of chunkEmbeddings) {
      if (emb !== null) {
        finalEmbeddings.push(emb);
      } else {
        finalEmbeddings.push(generatedEmbeddings[genIndex++]);
      }
    }

    if (finalEmbeddings.length === 0) {
      this.logger.warn('low_priority_embedding_worker.no_embeddings_generated', { noteId });
      return;
    }

    const records = chunks.map((chunk, i) => ({
      userId,
      noteId,
      chunkIndex: chunk.chunkIndex,
      chunkText: chunk.chunkText,
      embedding: finalEmbeddings[i],
      model: env.embeddingAiModel,
    }));

    await this.noteEmbeddingRepository.upsertChunks(userId, noteId, records);

    const bodySearchText = resolveNoteBodySearchText(note.markdown, note.metadata);
    if (bodySearchText) {
      await this.contentRepository.updateNoteBodySearchText(userId, noteId, bodySearchText);
    }

    this.logger.info('low_priority_embedding_worker.indexed', {
      noteId,
      chunksCount: chunks.length,
      reusedChunksCount: chunks.length - textsToEmbed.length,
    });
  }

  private async processDelete(userId: string, noteId: string) {
    await this.noteEmbeddingRepository.deleteByNoteId(userId, noteId);
  }

  private async processReindexAll(userId: string) {
    const notes = await this.contentRepository.listNotes(userId);

    this.logger.info('low_priority_embedding_worker.reindex_all_started', {
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
        this.logger.error('low_priority_embedding_worker.reindex_note_failed', {
          noteId: note.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('low_priority_embedding_worker.reindex_all_completed', {
      userId,
      indexed,
      failed,
      total: notes.length,
    });
  }
}
