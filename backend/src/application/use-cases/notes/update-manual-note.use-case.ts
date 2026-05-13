import { Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateNoteInput } from '../../models/note-input.models.js';
import { ContentRepository } from '../../ports/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/runtime-environment.port.js';
import { normalizeDate, normalizeTime } from '../../../domain/time.js';
import { buildUpdatedNote } from './note-editor.helpers.js';

@Injectable()
export class UpdateNoteUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
  ) {}

  async execute(input: UpdateNoteInput, userId: string) {
    const { note, previousFolder, nextFolder } = await this.loadEditableNote(userId, input.id, input.folderId);
    const reminderTimeZone = this.environmentProvider.read().reminderTimeZone;
    const normalizedInput = {
      ...input,
      reminderDate: normalizeDate(input.reminderDate, reminderTimeZone),
      reminderTime: normalizeTime(input.reminderTime),
    };
    const updated = await this.contentRepository.updateNote(
      userId,
      buildUpdatedNote(note, previousFolder, nextFolder, normalizedInput, reminderTimeZone),
    );
    return { ok: true as const, noteId: updated.id };
  }

  private async loadEditableNote(userId: string, noteId: string, folderId?: string) {
    const note = await this.contentRepository.getNoteById(userId, noteId);
    if (!note) throw new NotFoundException('note_not_found');

    const project = await this.contentRepository.getProjectBySlug(userId, note.projectSlug);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');
    const previousFolder = note.folderId
      ? await this.contentRepository.getProjectFolderById(userId, project.projectSlug, note.folderId)
      : null;
    const nextFolder = folderId
      ? await this.contentRepository.getProjectFolderById(userId, project.projectSlug, folderId)
      : null;
    if (folderId && !nextFolder) throw new NotFoundException('folder_not_found');
    return { note, previousFolder, nextFolder };
  }
}
