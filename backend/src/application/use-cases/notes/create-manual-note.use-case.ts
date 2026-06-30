import { Injectable } from '@nestjs/common';

import { WebhookTrigger } from '../../../contracts/enums.js';
import { withDerivedReminderAt } from '../../../contracts/ingest.js';
import type { CreateManualNoteDto } from '../../dto/note.dto.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { NoteEventDispatcher } from '../../services/note-event-dispatcher.js';
import { IngestEntryUseCase } from '../ingest/ingest-entry.use-case.js';
import { toIngestPayload, type NoteMapperContext } from '../../mappers/note.mapper.js';
import { requireProject } from '../../helpers/resource-validation.helpers.js';

@Injectable()
export class CreateManualNoteUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly noteEventDispatcher: NoteEventDispatcher,
  ) { }

  async execute(input: CreateManualNoteDto, userId: string) {
    const project = await requireProject(this.contentRepository, userId, input.projectId);
    const workspaceSlug = project.workspaceSlug || 'default';
    const reminderTimeZone = this.environmentProvider.read().reminderTimeZone;

    // Check if a note with the same source + sessionId already exists to avoid duplicates
    let existingNoteId: string | undefined;
    const activeSource = input.source?.trim();
    if (activeSource && input.sessionId) {
      const existingNote = await this.contentRepository.getNoteBySourceAndSessionId(userId, activeSource, input.sessionId);
      if (existingNote) {
        existingNoteId = existingNote.id;
      }
    }

    const categoryIds = input.categoryIds || [];
    const categories = categoryIds.length > 0
      ? await this.contentRepository.listCategories(userId, project.workspaceId)
      : [];

    const mapperContext: NoteMapperContext = {
      categories,
      projectSlug: project.projectSlug,
      workspaceSlug,
      reminderTimeZone,
    };

    const payload = toIngestPayload(input, mapperContext, existingNoteId);

    return this.ingestEntryUseCase.execute(withDerivedReminderAt(payload, reminderTimeZone), userId, workspaceSlug, {
      folderId: input.folderId,
      existingNoteId,
      categoryIds,
      existingNotePath: input.path,
    }).then((result) => {
      this.noteEventDispatcher.dispatch({
        event: WebhookTrigger.NoteCreated,
        noteId: result.noteId,
        userId,
        workspaceSlug,
        projectSlug: project.projectSlug,
        title: input.title,
        content: input.rawText,
        occurredAt: input.occurredAt || new Date().toISOString(),
      }).catch(() => { /* webhook dispatch must never block note creation */ });
      return result;
    });
  }
}

