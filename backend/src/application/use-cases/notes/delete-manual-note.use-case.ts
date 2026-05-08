import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentRepository } from '../../ports/content.repository.js';

@Injectable()
export class DeleteNoteUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(id: string, userId: string) {
    const note = await this.contentRepository.getNoteById(userId, id);
    if (!note) throw new NotFoundException('note_not_found');

    await this.contentRepository.deleteNote(userId, note.id);

    return { ok: true as const, noteId: note.id };
  }
}
