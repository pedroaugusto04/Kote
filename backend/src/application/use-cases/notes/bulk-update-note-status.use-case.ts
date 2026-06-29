import { Injectable } from '@nestjs/common';
import { WebhookTrigger } from '../../../contracts/enums.js';
import { resolveCanonicalTypeFromCategories } from '../../../domain/note-classification.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { EmbeddingQueuePublisher, EmbeddingJobType } from '../../ports/notes/embedding-queue.publisher.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { ContentObjectStorageService } from '../../services/content-object-storage.service.js';
import { buildUpdatedNote, extractEditableRawText } from './note-editor.helpers.js';
import { NoteEventDispatcher } from '../../services/note-event-dispatcher.js';

@Injectable()
export class BulkUpdateNoteStatusUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly embeddingQueue: EmbeddingQueuePublisher,
    private readonly noteEventDispatcher: NoteEventDispatcher,
    private readonly contentObjectStorage: ContentObjectStorageService,
  ) {}

  async execute(userId: string, ids: string[], status: any) {
    if (ids.length === 0) {
      return { ok: true as const, updatedCount: 0 };
    }

    const notes = await this.contentRepository.getNotesByIds(userId, ids);
    const reminderTimeZone = this.environmentProvider.read().reminderTimeZone;

    await Promise.all(
      notes.map(async (note) => {
        const rawText = extractEditableRawText(note);
        const canonicalType = resolveCanonicalTypeFromCategories(note.categories, note.categories.map((c) => c.id));
        const input = {
          id: note.id,
          title: note.title,
          rawText,
          tags: note.tags,
          status,
          canonicalType,
          reminderAt: note.reminderAt,
        };

        const updatedFields = buildUpdatedNote(
          note,
          null,
          null,
          input,
          reminderTimeZone,
          note.projectSlug || undefined,
          note.projectId || undefined,
          note.workspaceSlug || undefined,
          note.workspaceId || undefined,
        );

        // Update markdown in storage directly (no DB query here)
        await this.contentObjectStorage.saveNoteMarkdown(userId, {
          ...note,
          ...updatedFields,
        });

        // Trigger side effects
        try {
          await this.embeddingQueue.publish({ type: EmbeddingJobType.Index, userId, noteId: note.id });
        } catch { /* ignore */ }

        try {
          await this.noteEventDispatcher.dispatch({
            event: WebhookTrigger.NoteUpdated,
            noteId: note.id,
            userId,
            workspaceSlug: note.workspaceSlug || '',
            projectSlug: note.projectSlug || '',
            title: note.title,
            content: updatedFields.markdown,
            occurredAt: new Date().toISOString(),
          });
        } catch { /* ignore */ }
      })
    );

    // Update statuses in the database in a single query
    await this.contentRepository.updateNoteStatuses(userId, ids, status);

    return { ok: true as const, updatedCount: notes.length };
  }
}
