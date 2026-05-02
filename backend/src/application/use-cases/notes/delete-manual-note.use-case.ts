import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentRepository } from '../../ports/content.repository.js';
import { isManualEventNote } from './manual-note.helpers.js';

@Injectable()
export class DeleteManualNoteUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(id: string, userId: string) {
    const note = await this.contentRepository.getNoteById(userId, id);
    if (!note) throw new NotFoundException('note_not_found');
    if (!isManualEventNote(note)) throw new BadRequestException('note_not_deletable');

    const reminder = await this.contentRepository.findReminderBySourceNotePath(userId, note.path);
    if (reminder) await this.contentRepository.deleteNote(userId, reminder.id);
    await this.contentRepository.deleteNote(userId, note.id);

    return { ok: true as const, noteId: note.id, reminderNoteId: reminder?.id || '' };
  }
}
