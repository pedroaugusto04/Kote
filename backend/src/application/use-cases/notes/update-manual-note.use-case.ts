import { Injectable } from '@nestjs/common';
import type { UpdateNoteDto } from '../../dto/note.dto.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { buildUpdatedNote } from './note-editor.helpers.js';
import { NoteLifecycleService } from '../../services/content/note-lifecycle.service.js';
import { requireNote } from '../../helpers/resource-validation.helpers.js';
import { WorkspaceScopeResolver } from '../../services/content/workspace-scope-resolver.service.js';
import { resolveCanonicalTypeFromCategories } from '../../../domain/note-classification.js';
import { sanitizeManualNoteContent } from '../../helpers/sensitive-data-redaction.helpers.js';
import { PostgresDatabase } from '../../../infrastructure/persistence/database.js';

@Injectable()
export class UpdateNoteUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly noteLifecycleService: NoteLifecycleService,
    private readonly database: PostgresDatabase,
    private readonly scopeResolver: WorkspaceScopeResolver,
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

    const targetProject = (sanitizedInput.projectId && sanitizedInput.projectId !== note.projectId)
      ? await this.scopeResolver.resolveProject(userId, sanitizedInput.projectId)
      : null;

    const scope = {
      projectId: targetProject?.id ?? note.projectId,
      projectSlug: targetProject?.projectSlug ?? (note.projectSlug || ''),
      workspaceId: targetProject?.workspaceId ?? note.workspaceId,
      workspaceSlug: targetProject?.workspaceSlug ?? (note.workspaceSlug || ''),
      reminderTimeZone,
    };

    const previousFolder = note.folderId
      ? await this.scopeResolver.resolveProjectFolder(userId, note.projectId, note.folderId)
      : null;
    const nextFolder = sanitizedInput.folderId
      ? await this.scopeResolver.resolveProjectFolder(userId, scope.projectId, sanitizedInput.folderId)
      : null;

    const updatedNoteInput = {
      ...buildUpdatedNote({
        note,
        previousFolder,
        nextFolder,
        input: { ...sanitizedInput, canonicalType },
        scope,
      }),
      categoryIds: sanitizedInput.categoryIds,
    };

    const save = (transaction?: any) => this.noteLifecycleService.saveNote(
      userId,
      { noteInput: updatedNoteInput, attachments: sanitizedInput.attachments },
      { existingNoteId: note.id, workspaceSlug: note.workspaceSlug || undefined, projectSlug: note.projectSlug || undefined },
      transaction,
    );
    const { note: updated } = tx ? await save(tx) : await this.database.getDb().transaction(save);

    return { ok: true as const, noteId: updated.id };
  }

}
