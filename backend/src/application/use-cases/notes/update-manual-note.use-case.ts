import { Injectable, NotFoundException } from '@nestjs/common';
import { WebhookTrigger } from '../../../contracts/enums.js';
import type { UpdateNoteInput } from '../../models/note-input.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { EmbeddingQueuePublisher, EmbeddingJobType } from '../../ports/notes/embedding-queue.publisher.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { normalizeDate, normalizeTime } from '../../../domain/time.js';
import { buildUpdatedNote } from './note-editor.helpers.js';
import { NoteEventDispatcher } from '../../services/note-event-dispatcher.js';

@Injectable()
export class UpdateNoteUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly embeddingQueue: EmbeddingQueuePublisher,
    private readonly noteEventDispatcher: NoteEventDispatcher,
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

    try {
      await this.embeddingQueue.publish({ type: EmbeddingJobType.Index, userId, noteId: updated.id });
    } catch { /* embedding queue failure must never block note update */ }

    try {
      await this.noteEventDispatcher.dispatch({
        event: WebhookTrigger.NoteUpdated,
        noteId: updated.id,
        userId,
        workspaceSlug: note.workspaceSlug,
        projectSlug: note.projectSlug,
        title: normalizedInput.title || note.title,
        content: updated.markdown,
        occurredAt: new Date().toISOString(),
      });
    } catch { /* webhook dispatch must never block note update */ }

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
