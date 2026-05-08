import { Injectable } from '@nestjs/common';

import { buildNoteEditorState } from '../notes/note-editor.helpers.js';
import { noteDetail } from '../../../infrastructure/mappers/content-query.mappers.js';
import { ContentRepository } from '../../ports/content.repository.js';

@Injectable()
export class GetNoteDetailUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(userId: string, id: string) {
    const note = await this.contentRepository.getNoteById(userId, id);
    if (!note) return null;
    return {
      ...noteDetail(note),
      editor: buildNoteEditorState(note),
    };
  }
}
