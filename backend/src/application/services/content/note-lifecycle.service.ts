import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { QuotaService } from '../quota/quota.service.js';
import { QuotaResourceType } from '../../../domain/enums/plans.enums.js';
import { QuotaExceededException } from '../../../interfaces/http/quota-exceeded.exception.js';
import { EmbeddingQueuePublisher, EmbeddingJobType } from '../../ports/notes/embedding-queue.publisher.js';
import { EmbeddingPriority } from '../../../domain/enums/knowledge.enums.js';
import { NoteEventDispatcher } from '../webhooks/note-event-dispatcher.js';
import { WebhookTrigger } from '../../../contracts/enums.js';
import { calculateAttachmentSize } from '../../../domain/strings.js';
import { isNoteEligibleForEmbedding } from '../../../domain/utils/note-embedding.utils.js';
import { AppLogger } from '../../../observability/logger.js';
import type { NoteRecord, AttachmentRecord, SaveNoteInput } from '../../models/repository-records.models.js';

@Injectable()
export class NoteLifecycleService {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly quotaService: QuotaService,
    private readonly embeddingQueue: EmbeddingQueuePublisher,
    private readonly noteEventDispatcher: NoteEventDispatcher,
    private readonly logger: AppLogger,
  ) {}

  async saveNote(
    userId: string,
    input: {
      noteInput: SaveNoteInput;
      attachments?: Array<{
        fileName: string;
        mimeType: string;
        sizeBytes?: number | null;
        dataBase64?: string | null;
      }>;
    },
    options: {
      existingNoteId?: string;
      workspaceSlug?: string;
      projectSlug?: string;
    } = {},
    tx?: any
  ): Promise<{ note: NoteRecord; attachments: AttachmentRecord[] }> {
    const { noteInput, attachments: incomingAttachments } = input;
    const targetNoteId = options.existingNoteId || noteInput.id;

    // 1. Calculate size and check quota
    const incomingNoteSize = await this.calculateTotalIncomingSize(userId, noteInput.markdown, incomingAttachments, targetNoteId, tx);
    const sizeDifference = await this.calculateSizeDifference(userId, targetNoteId, incomingNoteSize, tx);

    if (sizeDifference > 0) {
      const quotaResult = await this.quotaService.checkQuota(userId, QuotaResourceType.STORAGE, sizeDifference);
      if (!quotaResult.allowed) {
        throw new QuotaExceededException('storage', quotaResult.limit, quotaResult.current);
      }
    }

    // 2. Persist Note
    const finalNoteInput: SaveNoteInput = { ...noteInput, sizeBytes: incomingNoteSize };
    const note = options.existingNoteId
      ? await this.contentRepository.updateNote(userId, { ...finalNoteInput, id: options.existingNoteId }, tx)
      : await this.contentRepository.upsertNote(userId, finalNoteInput, tx);

    // 3. Reconcile Attachments
    const attachments = await this.reconcileAttachments(userId, note.id, incomingAttachments, options.existingNoteId, tx);

    // 4. Background side-effects (Embedding & Webhooks)
    await this.dispatchBackgroundEvents(userId, note, options);

    return { note, attachments };
  }

  private async calculateTotalIncomingSize(
    userId: string,
    markdown: string | undefined,
    incomingAttachments: Array<{ sizeBytes?: number | null; dataBase64?: string | null }> | undefined,
    targetNoteId: string | undefined,
    tx?: any,
  ): Promise<number> {
    const markdownSize = Buffer.byteLength(markdown || '', 'utf8');
    if (incomingAttachments) {
      return markdownSize + incomingAttachments.reduce((acc, att) => acc + calculateAttachmentSize(att.sizeBytes, att.dataBase64), 0);
    }
    if (!targetNoteId) return markdownSize;
    const existingAttachments = await this.contentRepository.listAttachments(userId, targetNoteId, tx);
    return markdownSize + existingAttachments.reduce((acc, att) => acc + (att.sizeBytes || 0), 0);
  }

  private async calculateSizeDifference(
    userId: string,
    targetNoteId: string | undefined,
    incomingNoteSize: number,
    tx?: any,
  ): Promise<number> {
    if (!targetNoteId) return incomingNoteSize;
    const existingNote = await this.contentRepository.getNoteById(userId, targetNoteId, tx);
    return existingNote ? incomingNoteSize - (existingNote.sizeBytes || 0) : incomingNoteSize;
  }

  private async reconcileAttachments(
    userId: string,
    noteId: string,
    incomingAttachments: Array<{ fileName: string; mimeType: string; sizeBytes?: number | null; dataBase64?: string | null }> | undefined,
    existingNoteId: string | undefined,
    tx?: any,
  ): Promise<AttachmentRecord[]> {
    if (!incomingAttachments) {
      return existingNoteId ? this.contentRepository.listAttachments(userId, noteId, tx) : [];
    }

    if (existingNoteId) {
      const existingList = await this.contentRepository.listAttachments(userId, noteId, tx);
      const incomingNames = new Set(incomingAttachments.map((att) => att.fileName));
      const toDelete = existingList.filter((att) => !incomingNames.has(att.fileName));
      await Promise.all(toDelete.map((att) => this.contentRepository.deleteAttachment(userId, noteId, att.fileName)));
    }

    return Promise.all(
      incomingAttachments
        .filter((att) => att.dataBase64)
        .map((att) =>
          this.contentRepository.saveAttachment(userId, {
            noteId,
            fileName: att.fileName,
            mimeType: att.mimeType,
            sizeBytes: att.sizeBytes || 0,
            dataBase64: att.dataBase64 || '',
            checksumSha256: crypto.createHash('sha256').update(att.dataBase64 || '', 'base64').digest('hex'),
          }, tx)
        )
    );
  }

  private async dispatchBackgroundEvents(
    userId: string,
    note: NoteRecord,
    options: { existingNoteId?: string; workspaceSlug?: string; projectSlug?: string },
  ): Promise<void> {
    await this.dispatchEmbeddingIndex(userId, note);
    await this.dispatchWebhookEvent(userId, note, options);
  }

  private async dispatchEmbeddingIndex(userId: string, note: NoteRecord): Promise<void> {
    if (!isNoteEligibleForEmbedding(note)) {
      return;
    }

    try {
      await this.embeddingQueue.publish({
        type: EmbeddingJobType.Index,
        userId,
        noteId: note.id,
        priority: EmbeddingPriority.Low,
      });
    } catch (e) {
      this.logger.error('note_lifecycle.embedding_publish_failed', {
        userId,
        noteId: note.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async dispatchWebhookEvent(
    userId: string,
    note: NoteRecord,
    options: { existingNoteId?: string; workspaceSlug?: string; projectSlug?: string },
  ): Promise<void> {
    try {
      await this.noteEventDispatcher.dispatch({
        event: options.existingNoteId ? WebhookTrigger.NoteUpdated : WebhookTrigger.NoteCreated,
        noteId: note.id,
        userId,
        workspaceSlug: options.workspaceSlug || note.workspaceSlug || '',
        projectSlug: options.projectSlug || note.projectSlug || '',
        title: note.title,
        content: note.markdown,
        occurredAt: new Date().toISOString(),
      });
    } catch (e) {
      this.logger.error('note_lifecycle.webhook_dispatch_failed', {
        userId,
        noteId: note.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
