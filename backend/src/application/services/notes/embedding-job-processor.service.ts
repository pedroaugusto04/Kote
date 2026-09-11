import { Injectable, Optional } from '@nestjs/common';
import { EmbeddingGateway, type EmbeddingConfig } from '../../ports/notes/embedding.gateway.js';
import { NoteEmbeddingRepository, EmbeddingRepresentation } from '../../ports/notes/note-embedding.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { ObjectStorage } from '../../ports/notes/object-storage.js';
import { NoteChunkingService } from '../content/note-chunking.service.js';
import { NoteSynthesisRepository } from '../../ports/notes/note-synthesis.repository.js';
import { AppLogger } from '../../../observability/logger.js';
import type { AttachmentRecord, NoteRecord } from '../../models/repository-records.models.js';
import type { NoteChunkAttachment } from '../../models/note-chunk.models.js';
import type { NoteSynthesisRecord } from '../../models/note-synthesis.models.js';
import { resolveAttachmentTextContent } from '../../helpers/attachment-resolver.helper.js';
import { resolveNoteBodySearchText } from '../../../domain/utils/note-search-text.utils.js';
import { isNoteEligibleForEmbedding } from '../../../domain/utils/note-embedding.utils.js';
import { NoteSynthesisStatus } from '../../constants/ai-session-synthesis.constants.js';
import { buildSynthesisRetrievalChunks, getAiSessionSourceHash, parseAiSessionTurns } from '../content/ai-session-synthesis-transcript.service.js';
import { SourceChannel } from '../../../domain/enums/knowledge.enums.js';
import { EmbeddingJobType, type EmbeddingJobPayload } from '../../ports/notes/embedding-queue.publisher.js';

@Injectable()
export class EmbeddingJobProcessorService {
  constructor(
    private readonly embeddingGateway: EmbeddingGateway,
    private readonly noteEmbeddingRepository: NoteEmbeddingRepository,
    private readonly contentRepository: ContentRepository,
    private readonly chunkingService: NoteChunkingService,
    private readonly runtimeEnv: RuntimeEnvironmentProvider,
    private readonly logger: AppLogger,
    private readonly objectStorage: ObjectStorage,
    @Optional() private readonly synthesisRepository?: NoteSynthesisRepository,
  ) {}

  async processJob(ch: any, job: EmbeddingJobPayload): Promise<void> {
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
      case EmbeddingJobType.QueryEmbedding:
        await this.processQueryEmbedding(
          ch,
          job as EmbeddingJobPayload & {
            type: EmbeddingJobType.QueryEmbedding;
            queryText: string;
            replyTo?: string;
            correlationId?: string;
          },
        );
        break;
      default:
        this.logger.warn('embedding_job_processor.unknown_job_type', { job });
    }
  }

  async processIndex(userId: string, noteId: string): Promise<void> {
    const note = await this.contentRepository.getNoteById(userId, noteId);
    if (!note) {
      this.logger.warn('embedding_job_processor.note_not_found', { noteId });
      await this.noteEmbeddingRepository.deleteByNoteId(userId, noteId);
      return;
    }

    if (!isNoteEligibleForEmbedding(note)) {
      return;
    }

    const env = this.runtimeEnv.read();
    const embeddingConfig: EmbeddingConfig = {
      provider: env.embeddingAiProvider,
      baseUrl: env.embeddingAiBaseUrl,
      model: env.embeddingAiModel,
      apiKey: env.embeddingAiApiKey,
    };
    const attachments = await this.contentRepository.listAttachments(userId, noteId);

    this.logger.info('embedding_job_processor.attachments_found', {
      noteId,
      count: attachments.length,
      files: attachments.map((a) => ({
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        hasStorageKey: Boolean(a.storageKey),
      })),
    });

    const processedAttachments: NoteChunkAttachment[] = await Promise.all(
      attachments.map(async (attachment: AttachmentRecord) => ({
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        content: await resolveAttachmentTextContent(
          attachment,
          this.objectStorage,
          this.logger,
          'embedding_job_processor',
          noteId,
        ),
      })),
    );

    const chunks = this.buildRawChunks(note, processedAttachments);
    if (chunks.length === 0) {
      await this.noteEmbeddingRepository.deleteByNoteId(userId, noteId);
      return;
    }

    const existingEmbeddings = await this.noteEmbeddingRepository.getNoteEmbeddings(userId, noteId);
    const textToEmbeddingMap = new Map<string, number[]>();
    for (const rec of existingEmbeddings) {
      if (rec.model === env.embeddingAiModel && Array.isArray(rec.embedding) && rec.embedding.length > 0) {
        textToEmbeddingMap.set(`${rec.representation || EmbeddingRepresentation.Raw}:${rec.chunkText}`, rec.embedding);
      }
    }

    const textsToEmbed: string[] = [];
    const chunkEmbeddings: (number[] | null)[] = [];

    for (const chunk of chunks) {
      const existing = textToEmbeddingMap.get(`${EmbeddingRepresentation.Raw}:${chunk.chunkText}`);
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
        this.logger.warn('embedding_job_processor.embeddings_count_mismatch', {
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
      this.logger.warn('embedding_job_processor.no_embeddings_generated', { noteId });
      return;
    }

    const records = chunks.map((chunk, i) => ({
      userId,
      noteId,
      chunkIndex: chunk.chunkIndex,
      chunkText: chunk.chunkText,
      embedding: finalEmbeddings[i],
      model: env.embeddingAiModel,
      representation: EmbeddingRepresentation.Raw,
      sourceRefs: chunk.sourceRefs,
    }));

    await this.noteEmbeddingRepository.upsertChunks(userId, noteId, records);

    if (this.synthesisRepository) {
      const synthesis = await this.synthesisRepository.getByNoteId(userId, noteId);
      const sourceHash = getAiSessionSourceHash(note.markdown);
      if (synthesis && this.isUsableSynthesis(synthesis, sourceHash)) {
        await this.indexSynthesis(userId, noteId, env, embeddingConfig, synthesis, textToEmbeddingMap);
      } else {
        await this.noteEmbeddingRepository.deleteByNoteIdAndRepresentation(
          userId,
          noteId,
          EmbeddingRepresentation.Synthesis,
        );
      }
    }

    const bodySearchText = resolveNoteBodySearchText(note.markdown, note.metadata);
    if (bodySearchText) {
      await this.contentRepository.updateNoteBodySearchText(userId, noteId, bodySearchText);
    }

    this.logger.info('embedding_job_processor.indexed', {
      noteId,
      chunksCount: chunks.length,
      reusedChunksCount: chunks.length - textsToEmbed.length,
    });
  }

  async processDelete(userId: string, noteId: string): Promise<void> {
    await this.noteEmbeddingRepository.deleteByNoteId(userId, noteId);
    this.logger.info('embedding_job_processor.deleted_embeddings', { noteId });
  }

  async processReindexAll(userId: string): Promise<void> {
    const notes = await this.contentRepository.listNotes(userId);

    this.logger.info('embedding_job_processor.reindex_all_started', {
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
        this.logger.error('embedding_job_processor.reindex_note_failed', {
          noteId: note.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('embedding_job_processor.reindex_all_completed', {
      userId,
      indexed,
      failed,
      total: notes.length,
    });
  }

  async processQueryEmbedding(
    ch: any,
    job: EmbeddingJobPayload & {
      type: EmbeddingJobType.QueryEmbedding;
      queryText: string;
      replyTo?: string;
      correlationId?: string;
    },
  ): Promise<void> {
    const env = this.runtimeEnv.read();
    const embeddingConfig: EmbeddingConfig = {
      provider: env.embeddingAiProvider,
      baseUrl: env.embeddingAiBaseUrl,
      model: env.embeddingAiModel,
      apiKey: env.embeddingAiApiKey,
    };

    try {
      const embeddings = await this.embeddingGateway.generateEmbeddings(embeddingConfig, [job.queryText]);

      if (job.replyTo) {
        await ch.sendToQueue(
          job.replyTo,
          Buffer.from(
            JSON.stringify({
              embeddings,
              correlationId: job.correlationId,
            }),
          ),
        );
      }
    } catch (error) {
      this.logger.error('embedding_job_processor.query_embedding_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (job.replyTo) {
        await ch.sendToQueue(
          job.replyTo,
          Buffer.from(
            JSON.stringify({
              embeddings: [],
              correlationId: job.correlationId,
              error: error instanceof Error ? error.message : String(error),
            }),
          ),
        );
      }
    }
  }

  private buildRawChunks(note: NoteRecord, attachments: NoteChunkAttachment[]) {
    const isAiSession = note.sourceChannel === SourceChannel.AiChat || note.source === SourceChannel.AiChat;
    const turns = isAiSession ? parseAiSessionTurns(note.markdown || '') : [];
    if (!isAiSession || turns.length === 0) {
      return this.chunkingService
        .chunkNote({
          title: note.title,
          body: note.markdown,
          projectSlug: note.projectSlug || '',
          path: note.path || '',
          attachments,
        })
        .map((chunk) => ({ ...chunk, sourceRefs: [] as number[] }));
    }

    const turnChunks = turns.flatMap((turn) =>
      this.chunkingService
        .chunkNote({
          title: note.title,
          body: `TURN ${turn.number} [${turn.role.toUpperCase()}]\n${turn.text}`,
          projectSlug: note.projectSlug || '',
          path: note.path || '',
        })
        .map((chunk) => ({ ...chunk, sourceRefs: [turn.number] })),
    );
    const attachmentChunks = this.chunkingService
      .chunkNote({
        title: note.title,
        body: '',
        projectSlug: note.projectSlug || '',
        path: note.path || '',
        attachments,
      })
      .map((chunk) => ({ ...chunk, sourceRefs: [] as number[] }));
    return [...turnChunks, ...attachmentChunks].map((chunk, index) => ({ ...chunk, chunkIndex: index }));
  }

  private isUsableSynthesis(synthesis: NoteSynthesisRecord | null, sourceHash: string): boolean {
    return (
      synthesis?.status === NoteSynthesisStatus.Completed &&
      synthesis.sourceHash === sourceHash &&
      Boolean(synthesis.overview?.trim())
    );
  }

  private async indexSynthesis(
    userId: string,
    noteId: string,
    env: ReturnType<RuntimeEnvironmentProvider['read']>,
    embeddingConfig: EmbeddingConfig,
    synthesis: NoteSynthesisRecord,
    existingEmbeddings: Map<string, number[]>,
  ) {
    const synthesisChunks = buildSynthesisRetrievalChunks(synthesis.overview, synthesis.memory);
    const pendingTexts: string[] = [];
    const embeddings: (number[] | null)[] = [];
    for (const chunk of synthesisChunks) {
      const existing = existingEmbeddings.get(`${EmbeddingRepresentation.Synthesis}:${chunk.chunkText}`);
      embeddings.push(existing || null);
      if (!existing) pendingTexts.push(chunk.chunkText);
    }
    const generated =
      pendingTexts.length > 0 ? await this.embeddingGateway.generateEmbeddings(embeddingConfig, pendingTexts) : [];
    if (generated.length !== pendingTexts.length) {
      await this.noteEmbeddingRepository.deleteByNoteIdAndRepresentation(
        userId,
        noteId,
        EmbeddingRepresentation.Synthesis,
      );
      this.logger.warn('embedding_job_processor.synthesis_embeddings_count_mismatch', {
        noteId,
        expected: pendingTexts.length,
        received: generated.length,
      });
      return;
    }

    let generatedIndex = 0;
    await this.noteEmbeddingRepository.upsertChunks(
      userId,
      noteId,
      synthesisChunks.map((chunk, index) => ({
        userId,
        noteId,
        chunkIndex: index,
        chunkText: chunk.chunkText,
        embedding: embeddings[index] || generated[generatedIndex++],
        model: env.embeddingAiModel,
        representation: EmbeddingRepresentation.Synthesis,
        sourceRefs: chunk.sourceRefs,
      })),
    );
  }
}
