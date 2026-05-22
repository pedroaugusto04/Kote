import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentRepository } from '../../ports/content.repository.js';
import { EmbeddingQueuePublisher, EmbeddingJobType } from '../../ports/embedding-queue.publisher.js';

@Injectable()
export class DeleteNoteUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly embeddingQueue: EmbeddingQueuePublisher,
  ) {}

  async execute(id: string, userId: string) {
    const note = await this.contentRepository.getNoteById(userId, id);
    if (!note) throw new NotFoundException('note_not_found');

    await this.contentRepository.deleteNote(userId, note.id);

    try {
      await this.embeddingQueue.publish({ type: EmbeddingJobType.Delete, userId, noteId: note.id });
    } catch { /* embedding queue failure must never block note delete */ }

    return { ok: true as const, noteId: note.id };
  }
}
