import { Injectable } from '@nestjs/common';
import type { UpdateNoteDto } from '../../dto/note.dto.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { buildUpdatedNote } from './note-editor.helpers.js';
import { NoteLifecycleService } from '../../services/content/note-lifecycle.service.js';
import { requireProject, requireNote, requireProjectFolderOptional } from '../../helpers/resource-validation.helpers.js';
import { resolveCanonicalTypeFromCategories } from '../../../domain/note-classification.js';
import { sanitizeManualNoteContent } from '../../helpers/sensitive-data-redaction.helpers.js';
import { PostgresDatabase } from '../../../infrastructure/persistence/database.js';

@Injectable()
export class UpdateNoteUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly noteLifecycleService: NoteLifecycleService
  ) {}

  async execute(input: UpdateNoteDto, userId: string, tx?: any) {
    // Sanitize sensitive data from the note content
    const { title: sanitizedTitle, rawText: sanitizedRawText } = sanitizeManualNoteContent(
      input.title || '',
      input.rawText || '',
      input.title,
    );

    const sanitizedInput: UpdateNoteDto = {
      ...input,
      rawText: sanitizedRawText,
      title: sanitizedTitle,
    };

    const note = await requireNote(this.contentRepository, userId, sanitizedInput.id);
    const reminderTimeZone = this.environmentProvider.read().reminderTimeZone;
    const categoryIds = sanitizedInput.categoryIds === undefined
      ? note.categories.map((category) => category.id)
      : sanitizedInput.categoryIds;
    const categories = categoryIds.length > 0
      ? await this.contentRepository.listCategories(userId, note.workspaceId)
      : [];
    const canonicalType = resolveCanonicalTypeFromCategories(categories, categoryIds);

    let projectSlug = note.projectSlug || '';
    let projectId = note.projectId;
    let workspaceSlug = note.workspaceSlug || '';
    let workspaceId = note.workspaceId;

    if (sanitizedInput.projectId && sanitizedInput.projectId !== note.projectId) {
      const project = await requireProject(this.contentRepository, userId, sanitizedInput.projectId);
      projectSlug = project.projectSlug;
      projectId = project.id;
      workspaceSlug = project.workspaceSlug || '';
      workspaceId = project.workspaceId;
    }

    const project = await this.contentRepository.getProjectById(userId, projectId);
    const previousFolder = note.folderId
      ? await requireProjectFolderOptional(this.contentRepository, userId, note.projectId, note.folderId)
      : null;
    const nextFolder = await requireProjectFolderOptional(this.contentRepository, userId, projectId, sanitizedInput.folderId);

    const updatedNoteInput = {
      ...buildUpdatedNote(note, previousFolder, nextFolder, { ...sanitizedInput, canonicalType }, projectSlug, projectId, workspaceSlug, workspaceId),
      categoryIds: sanitizedInput.categoryIds,
    };

    const { note: updated } = await this.noteLifecycleService.saveNote(
      userId,
      {
        noteInput: updatedNoteInput,
        attachments: sanitizedInput.attachments,
      },
      {
        existingNoteId: note.id,
        workspaceSlug: note.workspaceSlug || undefined,
        projectSlug: note.projectSlug || undefined,
      },
      tx,
    );

    return { ok: true as const, noteId: updated.id };
  }

}
