import crypto from 'node:crypto';

import { NotFoundException, Injectable } from '@nestjs/common';

import { CanonicalType, EventType, Importance, KnowledgeKind, KnowledgeStatus, SourceChannel, WebhookTrigger } from '../../../contracts/enums.js';
import { withDerivedReminderAt, type IngestPayload } from '../../../contracts/ingest.js';
import { hasReminder, normalizeManualNoteStatus } from '../../../domain/note-status.js';
import { isAiSource } from '../../../domain/notes.js';
import { normalizeDate, normalizeTime } from '../../../domain/time.js';
import type { CreateManualNoteInput } from '../../models/note-input.models.js';
import type { NoteRecord } from '../../models/repository-records.models.js';
import { ContentRepository } from '../../ports/notes/content.repository.js';
import { RuntimeEnvironmentProvider } from '../../ports/observability/runtime-environment.port.js';
import { NoteEventDispatcher } from '../../services/note-event-dispatcher.js';
import { IngestEntryUseCase } from '../ingest/ingest-entry.use-case.js';
import { stripTitleHeader } from './note-editor.helpers.js';

@Injectable()
export class CreateManualNoteUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly ingestEntryUseCase: IngestEntryUseCase,
    private readonly environmentProvider: RuntimeEnvironmentProvider,
    private readonly noteEventDispatcher: NoteEventDispatcher,
  ) { }

  async execute(input: CreateManualNoteInput, userId: string) {
    const workspaces = await this.contentRepository.listWorkspaces(userId);
    const workspace = workspaces[0];
    if (!workspace) throw new NotFoundException('workspace_not_found');

    const projects = await this.contentRepository.listProjects(userId);
    const project = projects.find((item) => item.enabled && item.workspaceSlug === workspace.workspaceSlug && item.projectSlug === input.projectSlug);
    if (!project) throw new NotFoundException('project_not_found');

    const reminderTimeZone = this.environmentProvider.read().reminderTimeZone;
    const reminderDate = normalizeDate(input.reminderDate, reminderTimeZone);
    const reminderTime = normalizeTime(input.reminderTime);
    const reminderAt = input.reminderAt || '';
    const status = normalizeManualNoteStatus({
      requestedStatus: input.status,
      currentStatus: KnowledgeStatus.Active,
      hadReminder: false,
      hasReminder: hasReminder({ reminderDate, reminderAt }),
    });
    const occurredAt = new Date().toISOString();
    const cleanedRawText = stripTitleHeader(input.rawText, input.title);
    const activeSource = input.source?.trim();
    const isAiChat = isAiSource(activeSource);

    const payload: IngestPayload = {
      source: {
        channel: input.sourceChannel || (isAiChat ? SourceChannel.AiChat : SourceChannel.External),
        system: activeSource || 'manual-api',
        actor: '',
        conversationId: workspace.workspaceSlug,
        correlationId: `manual:${crypto.randomUUID()}`,
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
        canonicalType: normalizeManualCanonicalType(input.canonicalType),
        importance: Importance.Low,
        status,
        tags: input.tags,
        decisionFlag: false,
      },
      actions: {
        reminderDate,
        reminderTime,
        reminderAt,
        followUpBy: '',
      },
      metadata: {
        workspaceSlug: workspace.workspaceSlug,
        manual: true,
        rawText: input.rawText,
        sessionId: input.sessionId,
      },
    };

    return this.ingestEntryUseCase.execute(withDerivedReminderAt(payload, reminderTimeZone), userId, workspace.workspaceSlug, {
      folderId: input.folderId,
    }).then((result) => {
      this.noteEventDispatcher.dispatch({
        event: WebhookTrigger.NoteCreated,
        noteId: result.noteId,
        userId,
        workspaceSlug: workspace.workspaceSlug,
        projectSlug: project.projectSlug,
        title: input.title,
        content: input.rawText,
        occurredAt: occurredAt,
      }).catch(() => { /* webhook dispatch must never block note creation */ });
      return result;
    });
  }
}

function normalizeManualCanonicalType(value: string | undefined) {
  if (value && Object.values(CanonicalType).includes(value as CanonicalType)) return value as CanonicalType;
  return CanonicalType.Event;
}
