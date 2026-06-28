import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ContentRepository } from '../ports/notes/content.repository.js';
import { QuotaService } from './quota.service.js';
import { QuotaResourceType } from '../../domain/enums/plans.enums.js';
import { QuotaExceededException } from '../../interfaces/http/quota-exceeded.exception.js';
import { EmbeddingQueuePublisher, EmbeddingJobType } from '../ports/notes/embedding-queue.publisher.js';
import { NoteEventDispatcher } from './note-event-dispatcher.js';
import { WebhookTrigger } from '../../contracts/enums.js';
import { calculateAttachmentSize } from '../../domain/strings.js';
import { AppLogger } from '../../observability/logger.js';
import type { NoteRecord, AttachmentRecord, SaveNoteInput } from '../models/repository-records.models.js';

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
    } = {}
  ): Promise<{ note: NoteRecord; attachments: AttachmentRecord[] }> {
    const { noteInput, attachments: incomingAttachments = [] } = input;

    // 1. Calculate incoming sizes
    const markdownSize = Buffer.byteLength(noteInput.markdown || '', 'utf8');
    const attachmentsSize = incomingAttachments.reduce((acc, att) => {
      return acc + calculateAttachmentSize(att.sizeBytes, att.dataBase64);
    }, 0);
    const incomingNoteSize = markdownSize + attachmentsSize;

    // 2. Calculate size difference if note exists
    let sizeDifference = incomingNoteSize;
    const targetNoteId = options.existingNoteId || noteInput.id;
    if (targetNoteId) {
      const existingNote = await this.contentRepository.getNoteById(userId, targetNoteId);
      if (existingNote) {
        sizeDifference = incomingNoteSize - (existingNote.sizeBytes || 0);
      }
    }

    // 3. Verify storage quota
    if (sizeDifference > 0) {
      const quotaResult = await this.quotaService.checkQuota(userId, QuotaResourceType.STORAGE, sizeDifference);
      if (!quotaResult.allowed) {
        throw new QuotaExceededException('storage', quotaResult.limit, quotaResult.current);
      }
    }

    // 4. Save/Update Note
    const finalNoteInput: SaveNoteInput = {
      ...noteInput,
      sizeBytes: incomingNoteSize,
    };
    
    let note: NoteRecord;
    if (options.existingNoteId) {
      note = await this.contentRepository.updateNote(userId, { ...finalNoteInput, id: options.existingNoteId });
    } else {
      note = await this.contentRepository.upsertNote(userId, finalNoteInput);
    }

    // 5. Save Attachments
    const attachments = await Promise.all(
      incomingAttachments.map((att) =>
        this.contentRepository.saveAttachment(userId, {
          noteId: note.id,
          fileName: att.fileName,
          mimeType: att.mimeType,
          sizeBytes: att.sizeBytes || 0,
          dataBase64: att.dataBase64 || '',
          checksumSha256: crypto.createHash('sha256').update(att.dataBase64 || '', 'base64').digest('hex'),
        })
      )
    );

    // 6. Queue Embedding Indexing
    try {
      await this.embeddingQueue.publish({ type: EmbeddingJobType.Index, userId, noteId: note.id });
    } catch (e) {
      this.logger.error('note_lifecycle.embedding_publish_failed', {
        userId,
        noteId: note.id,
        error: e instanceof Error ? e.message : String(e),
      });
      // Embedding queue failure must not block note ingestion/creation
    }

    // 7. Dispatch Webhooks
    const workspaceSlug = options.workspaceSlug || note.workspaceSlug || '';
    const projectSlug = options.projectSlug || note.projectSlug || '';
    try {
      await this.noteEventDispatcher.dispatch({
        event: options.existingNoteId ? WebhookTrigger.NoteUpdated : WebhookTrigger.NoteCreated,
        noteId: note.id,
        userId,
        workspaceSlug,
        projectSlug,
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
      // Webhook dispatch must not block note ingestion/creation
    }

    return { note, attachments };
  }
}
