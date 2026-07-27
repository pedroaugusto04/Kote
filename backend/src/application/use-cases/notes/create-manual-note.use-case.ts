import { Injectable } from '@nestjs/common';

import { WebhookTrigger } from '../../../contracts/enums.js';
import { withDerivedReminderAt } from '../../../contracts/ingest.js';
import type { CreateManualNoteDto } from '../../dto/note.dto.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { NoteEventDispatcher } from '../../services/webhooks/note-event-dispatcher.js';
import { IngestEntryUseCase } from '../ingest/ingest-entry.use-case.js';
import { toIngestPayload, type NoteMapperContext } from '../../mappers/note.mapper.js';
import { requireProject } from '../../helpers/resource-validation.helpers.js';
import { sanitizeManualNoteContent } from '../../helpers/sensitive-data-redaction.helpers.js';

@Injectable()
export class CreateManualNoteUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly noteEventDispatcher: NoteEventDispatcher,
  ) { }

  async execute(input: CreateManualNoteDto, userId: string) {
    // Sanitize sensitive data from the note content
    const { title: sanitizedTitle, rawText: sanitizedRawText } = sanitizeManualNoteContent(
      input.title || '',
      input.rawText || '',
      input.title,
    );

    const sanitizedInput: CreateManualNoteDto = {
      ...input,
      rawText: sanitizedRawText,
      title: sanitizedTitle,
    };

    const project = await requireProject(this.contentRepository, userId, sanitizedInput.projectId);
    const workspaceSlug = project.workspaceSlug || 'default';
    const reminderTimeZone = this.environmentProvider.read().reminderTimeZone;

    // Check if a note with the same source + sessionId already exists to avoid duplicates
    let existingNoteId: string | undefined;
    const activeSource = sanitizedInput.source?.trim();
    if (activeSource && sanitizedInput.sessionId) {
      const existingNote = await this.contentRepository.getNoteBySourceAndSessionId(userId, activeSource, sanitizedInput.sessionId);
      if (existingNote) {
        existingNoteId = existingNote.id;
      }
    }

    const categoryIds = sanitizedInput.categoryIds || [];
    const categories = categoryIds.length > 0
      ? await this.contentRepository.listCategories(userId, project.workspaceId)
      : [];

    const mapperContext: NoteMapperContext = {
      categories,
      projectSlug: project.projectSlug,
      workspaceSlug,
      reminderTimeZone,
    };

    const payload = toIngestPayload(sanitizedInput, mapperContext, existingNoteId);

    return this.ingestEntryUseCase.execute(withDerivedReminderAt(payload, reminderTimeZone), userId, workspaceSlug, {
      folderId: sanitizedInput.folderId,
      existingNoteId,
      categoryIds,
      existingNotePath: sanitizedInput.path,
    }).then((result) => {
      this.noteEventDispatcher.dispatch({
        event: WebhookTrigger.NoteCreated,
        noteId: result.noteId,
        userId,
        workspaceSlug,
        projectSlug: project.projectSlug,
        title: sanitizedInput.title,
        content: sanitizedInput.rawText,
        occurredAt: sanitizedInput.occurredAt || new Date().toISOString(),
      }).catch(() => { /* webhook dispatch must never block note creation */ });
      return result;
    });
  }
}

