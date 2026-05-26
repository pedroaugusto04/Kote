import { Injectable, NotFoundException } from '@nestjs/common';
import { WebhookTrigger } from '../../../contracts/enums.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { EmbeddingQueuePublisher, EmbeddingJobType } from '../../ports/notes/embedding-queue.publisher.js';
import { NoteEventDispatcher } from '../../services/note-event-dispatcher.js';

@Injectable()
export class DeleteNoteUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly embeddingQueue: EmbeddingQueuePublisher,
    private readonly noteEventDispatcher: NoteEventDispatcher,
  ) {}

  async execute(id: string, userId: string) {
    const note = await this.contentRepository.getNoteById(userId, id);
    if (!note) throw new NotFoundException('note_not_found');

    await this.contentRepository.deleteNote(userId, note.id);

    try {
      await this.embeddingQueue.publish({ type: EmbeddingJobType.Delete, userId, noteId: note.id });
    } catch { /* embedding queue failure must never block note delete */ }

    try {
      await this.noteEventDispatcher.dispatch({
        event: WebhookTrigger.NoteDeleted,
        noteId: note.id,
        userId,
        workspaceSlug: note.workspaceSlug,
        projectSlug: note.projectSlug,
        title: note.title,
        content: note.markdown,
        occurredAt: new Date().toISOString(),
      });
    } catch { /* webhook dispatch must never block note delete */ }

    return { ok: true as const, noteId: note.id };
  }
}
