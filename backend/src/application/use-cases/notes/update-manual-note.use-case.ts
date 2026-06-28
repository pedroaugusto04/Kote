import { Injectable, NotFoundException } from '@nestjs/common';
import { WebhookTrigger } from '../../../contracts/enums.js';
import { resolveCanonicalTypeFromCategories } from '../../../domain/note-classification.js';
import type { UpdateNoteInput } from '../../models/note-input.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { normalizeDate, normalizeTime } from '../../../domain/time.js';
import { buildUpdatedNote } from './note-editor.helpers.js';
import { NoteLifecycleService } from '../../services/note-lifecycle.service.js';

@Injectable()
export class UpdateNoteUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly noteLifecycleService: NoteLifecycleService,
  ) {}

  async execute(input: UpdateNoteInput, userId: string) {
    const { note, previousFolder, nextFolder } = await this.loadEditableNote(userId, input.id, input.folderId);
    const reminderTimeZone = this.environmentProvider.read().reminderTimeZone;
    const normalizedInput = {
      ...input,
      reminderDate: normalizeDate(input.reminderDate, reminderTimeZone),
      reminderTime: normalizeTime(input.reminderTime),
    };
    const categoryIds = normalizedInput.categoryIds === undefined
      ? note.categories.map((category) => category.id)
      : normalizedInput.categoryIds;
    const categories = categoryIds.length > 0
      ? await this.contentRepository.listCategories(userId, note.workspaceId)
      : [];
    const canonicalType = resolveCanonicalTypeFromCategories(categories, categoryIds);
    
    let projectSlug = note.projectSlug || '';
    let projectId = note.projectId;
    let workspaceSlug = note.workspaceSlug || '';
    let workspaceId = note.workspaceId;
    
    if (normalizedInput.projectSlug && normalizedInput.projectSlug !== note.projectSlug) {
      const newProject = await this.contentRepository.getProjectBySlug(userId, normalizedInput.projectSlug);
      if (!newProject || !newProject.enabled) throw new NotFoundException('project_not_found');
      projectSlug = normalizedInput.projectSlug;
      projectId = newProject.id;
      workspaceSlug = newProject.workspaceSlug || '';
      workspaceId = newProject.workspaceId;
    }
    
    const updatedNoteInput = {
      ...buildUpdatedNote(note, previousFolder, nextFolder, { ...normalizedInput, canonicalType }, reminderTimeZone, projectSlug, projectId, workspaceSlug, workspaceId),
      categoryIds: input.categoryIds,
    };

    const { note: updated } = await this.noteLifecycleService.saveNote(
      userId,
      {
        noteInput: updatedNoteInput,
      },
      {
        existingNoteId: note.id,
        workspaceSlug: note.workspaceSlug || undefined,
        projectSlug: note.projectSlug || undefined,
      }
    );

    // Global scheduling is handled by the batch worker; per-note scheduling removed

    return { ok: true as const, noteId: updated.id };
  }

  private async loadEditableNote(userId: string, noteId: string, folderId?: string) {
    const note = await this.contentRepository.getNoteById(userId, noteId);
    if (!note) throw new NotFoundException('note_not_found');

    const project = await this.contentRepository.getProjectById(userId, note.projectId);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');
    const previousFolder = note.folderId
      ? await this.contentRepository.getProjectFolderById(userId, project.id, note.folderId)
      : null;
    const nextFolder = folderId
      ? await this.contentRepository.getProjectFolderById(userId, project.id, folderId)
      : null;
    if (folderId && !nextFolder) throw new NotFoundException('folder_not_found');
    return { note, previousFolder, nextFolder };
  }
}
