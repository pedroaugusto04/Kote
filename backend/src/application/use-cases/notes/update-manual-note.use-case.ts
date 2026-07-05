import { Injectable } from '@nestjs/common';
import type { UpdateNoteDto } from '../../dto/note.dto.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { buildUpdatedNote } from './note-editor.helpers.js';
import { NoteLifecycleService } from '../../services/note-lifecycle.service.js';
import { requireProject, requireNote, requireProjectFolderOptional } from '../../helpers/resource-validation.helpers.js';
import { resolveCanonicalTypeFromCategories } from '../../../domain/note-classification.js';

@Injectable()
export class UpdateNoteUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly noteLifecycleService: NoteLifecycleService,
  ) {}

  async execute(input: UpdateNoteDto, userId: string) {
    const note = await requireNote(this.contentRepository, userId, input.id);
    const reminderTimeZone = this.environmentProvider.read().reminderTimeZone;
    const categoryIds = input.categoryIds === undefined
      ? note.categories.map((category) => category.id)
      : input.categoryIds;
    const categories = categoryIds.length > 0
      ? await this.contentRepository.listCategories(userId, note.workspaceId)
      : [];
    const canonicalType = resolveCanonicalTypeFromCategories(categories, categoryIds);

    let projectSlug = note.projectSlug || '';
    let projectId = note.projectId;
    let workspaceSlug = note.workspaceSlug || '';
    let workspaceId = note.workspaceId;

    if (input.projectId && input.projectId !== note.projectId) {
      const project = await requireProject(this.contentRepository, userId, input.projectId);
      projectSlug = project.projectSlug;
      projectId = project.id;
      workspaceSlug = project.workspaceSlug || '';
      workspaceId = project.workspaceId;
    }

    const project = await this.contentRepository.getProjectById(userId, projectId);
    const previousFolder = note.folderId
      ? await requireProjectFolderOptional(this.contentRepository, userId, note.projectId, note.folderId)
      : null;
    const nextFolder = await requireProjectFolderOptional(this.contentRepository, userId, projectId, input.folderId);

    const updatedNoteInput = {
      ...buildUpdatedNote(note, previousFolder, nextFolder, { ...input, canonicalType }, reminderTimeZone, projectSlug, projectId, workspaceSlug, workspaceId),
      categoryIds: input.categoryIds,
    };

    const { note: updated } = await this.noteLifecycleService.saveNote(
      userId,
      {
        noteInput: updatedNoteInput,
        attachments: input.attachments,
      },
      {
        existingNoteId: note.id,
        workspaceSlug: note.workspaceSlug || undefined,
        projectSlug: note.projectSlug || undefined,
      }
    );

    return { ok: true as const, noteId: updated.id };
  }

}
