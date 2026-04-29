import { Injectable } from '@nestjs/common';

import { buildManualEditorState } from '../notes/create-manual-note.use-case.js';
import { noteDetail } from '../../../infrastructure/mappers/content-query.mappers.js';
import { ContentRepository } from '../../ports/content.repository.js';

@Injectable()
export class GetNoteDetailUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(userId: string, id: string) {
    const note = await this.contentRepository.getNoteById(userId, id);
    if (!note) return null;
    const reminder = await this.contentRepository.findReminderBySourceNotePath(userId, note.path);
    return {
      ...noteDetail(note),
      editor: buildManualEditorState(note, reminder),
    };
  }
}
