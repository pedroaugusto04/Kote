import crypto from 'node:crypto';

import { NotFoundException, Injectable } from '@nestjs/common';

import { EventType, Importance, KnowledgeKind, KnowledgeStatus, SourceChannel, WebhookTrigger } from '../../../contracts/enums.js';
import { withDerivedReminderAt, type IngestPayload } from '../../../contracts/ingest.js';
import { hasReminder, normalizeManualNoteStatus } from '../../../domain/note-status.js';
import { isAiSource } from '../../../domain/notes.js';
import { resolveCanonicalTypeFromCategories } from '../../../domain/note-classification.js';
import { normalizeDate, normalizeTime } from '../../../domain/time.js';
import type { CreateManualNoteInput } from '../../models/note-input.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { NoteEventDispatcher } from '../../services/note-event-dispatcher.js';
import { IngestEntryUseCase } from '../ingest/ingest-entry.use-case.js';
import { stripTitleHeader } from './note-editor.helpers.js';
import { parseSourceChannelString } from '../../utils/source-channel.utils.js';

@Injectable()
export class CreateManualNoteUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly noteEventDispatcher: NoteEventDispatcher,
  ) { }

  async execute(input: CreateManualNoteInput & { projectId: string }, userId: string) {
    const project = await this.contentRepository.getProjectById(userId, input.projectId);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const workspaceId = project.workspaceId;
    const workspaceSlug = project.workspaceSlug || 'default';

    // Check if a note with the same source + sessionId already exists to avoid duplicates
    let existingNoteId: string | undefined;
    const activeSource = input.source?.trim();
    if (activeSource && input.sessionId) {
      const existingNote = await this.contentRepository.getNoteBySourceAndSessionId(userId, activeSource, input.sessionId);
      if (existingNote) {
        existingNoteId = existingNote.id;
      }
    }

    const reminderTimeZone = this.environmentProvider.read().reminderTimeZone;
    const reminderAt = input.reminderAt || '';
    const categoryIds = input.categoryIds || [];
    const categories = categoryIds.length > 0
      ? await this.contentRepository.listCategories(userId, workspaceId)
      : [];
    const canonicalType = resolveCanonicalTypeFromCategories(categories, categoryIds);
    const status = normalizeManualNoteStatus({
      requestedStatus: input.status,
      currentStatus: KnowledgeStatus.Active,
      hadReminder: false,
      hasReminder: hasReminder({ reminderAt }),
    });
    const occurredAt = input.occurredAt || new Date().toISOString();
    const cleanedRawText = stripTitleHeader(input.rawText, input.title);
    const isAiChat = isAiSource(activeSource);

    const payload: IngestPayload = {
      source: {
        channel: parseSourceChannelString(input.sourceChannel),
        system: activeSource || 'manual-api',
        actor: '',
        conversationId: workspaceSlug,
        correlationId: `manual:${crypto.randomUUID()}`,
        sessionId: input.sessionId || '',
      },
      event: {
        type: EventType.ManualNote,
        occurredAt,
        projectSlug: project.projectSlug,
      },
      content: {
        rawText: cleanedRawText,
        title: input.title,
        attachments: [],
        sections: {
          summary: cleanedRawText,
          impact: '',
          risks: [],
          nextSteps: [],
          reviewFindings: [],
        },
      },
      classification: {
        kind: KnowledgeKind.Note,
        canonicalType,
        importance: Importance.Low,
        status,
        tags: input.tags,
        decisionFlag: false,
      },
      actions: {
        reminderAt: input.reminderAt || '',
        followUpBy: '',
      },
      metadata: {
        rawText: input.rawText,
        ...(input.metadata || {}),
      },
    };

    return this.ingestEntryUseCase.execute(withDerivedReminderAt(payload, reminderTimeZone), userId, workspaceSlug, {
      folderId: input.folderId,
      existingNoteId,
      categoryIds: input.categoryIds,
      existingNotePath: input.path,
    }).then((result) => {
      this.noteEventDispatcher.dispatch({
        event: WebhookTrigger.NoteCreated,
        noteId: result.noteId,
        userId,
        workspaceSlug: workspaceSlug,
        projectSlug: project.projectSlug,
        title: input.title,
        content: input.rawText,
        occurredAt: occurredAt,
      }).catch(() => { /* webhook dispatch must never block note creation */ });
      return result;
    });
  }
}

