import crypto from 'node:crypto';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { CanonicalType, EventType, Importance, KnowledgeKind, KnowledgeStatus, SourceChannel } from '../../../contracts/enums.js';
import { withDerivedReminderAt, type IngestPayload } from '../../../contracts/ingest.js';
import { buildNotePaths, renderEventNote, renderReminderNote } from '../../../domain/notes.js';
import type { Project } from '../../../domain/projects.js';
import { trimText } from '../../../domain/strings.js';
import type { NoteRecord } from '../../models/repository-records.models.js';
import type { CreateManualNoteInput, UpdateManualNoteInput } from '../../models/note-input.models.js';
import { ContentRepository } from '../../ports/content.repository.js';
import { IngestEntryUseCase } from '../ingest/ingest-entry.use-case.js';

@Injectable()
export class CreateManualNoteUseCase {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly ingestEntryUseCase: IngestEntryUseCase,
  ) {}

  async execute(input: CreateManualNoteInput, userId: string) {
    const workspaces = await this.contentRepository.listWorkspaces(userId);
    const workspace = workspaces[0];
    if (!workspace) throw new NotFoundException('workspace_not_found');

    const projects = await this.contentRepository.listProjects(userId);
    const project = projects.find((item) => item.enabled && item.workspaceSlug === workspace.workspaceSlug && item.projectSlug === input.projectSlug);
    if (!project) throw new NotFoundException('project_not_found');

    const occurredAt = new Date().toISOString();
    const payload: IngestPayload = {
      schemaVersion: 1,
      source: {
        channel: SourceChannel.External,
        system: 'manual-api',
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
        rawText: input.rawText,
        title: input.title,
        attachments: [],
        sections: {
          summary: input.rawText,
          impact: '',
          risks: [],
          nextSteps: [],
          reviewFindings: [],
        },
      },
      classification: {
        kind: KnowledgeKind.Note,
        canonicalType: CanonicalType.Event,
        importance: Importance.Low,
        status: KnowledgeStatus.Active,
        tags: input.tags,
        decisionFlag: false,
      },
      actions: {
        reminderDate: input.reminderDate,
        reminderTime: input.reminderTime,
        followUpBy: '',
      },
      metadata: {
        workspaceSlug: workspace.workspaceSlug,
        manual: true,
        rawText: input.rawText,
      },
    };

    return this.ingestEntryUseCase.execute(payload, userId, workspace.workspaceSlug);
  }
}

export function isManualEventNote(note: NoteRecord): boolean {
  return note.type === 'event' && note.source === 'manual-api' && note.metadata.manual === true;
}

export function buildManualEditorState(note: NoteRecord, reminder: NoteRecord | null) {
  if (!isManualEventNote(note)) return null;

  const rawText = String(note.metadata.rawText || '').trim();
  if (!rawText) throw new BadRequestException('note_raw_text_missing');
  const reminderDate = String(reminder?.metadata.reminderDate || note.metadata.reminderDate || '').trim();
  const reminderTime = String(reminder?.metadata.reminderTime || note.metadata.reminderTime || '').trim();

  return {
    canDelete: true,
    rawText,
    reminderDate,
    reminderTime,
  };
}

function buildManualNotePayload(note: NoteRecord, project: Project, input: {
  title: string;
  rawText: string;
  tags: string[];
  reminderDate: string;
  reminderTime: string;
}): IngestPayload {
  return {
    schemaVersion: 1,
    source: {
      channel: (note.sourceChannel || SourceChannel.External) as SourceChannel,
      system: note.source || 'manual-api',
      actor: '',
      conversationId: note.workspaceSlug,
      correlationId: String(note.frontmatter.id || `manual:${note.id}`),
    },
    event: {
      type: EventType.ManualNote,
      occurredAt: note.occurredAt,
      projectSlug: project.projectSlug,
    },
    content: {
      rawText: input.rawText,
      title: trimText(input.title, input.rawText),
      attachments: [],
      sections: {
        summary: input.rawText,
        impact: '',
        risks: [],
        nextSteps: [],
        reviewFindings: [],
      },
    },
    classification: {
      kind: KnowledgeKind.Note,
      canonicalType: note.type as IngestPayload['classification']['canonicalType'],
      importance: Importance.Low,
      status: (note.status || KnowledgeStatus.Active) as KnowledgeStatus,
      tags: input.tags,
      decisionFlag: false,
    },
    actions: {
      reminderDate: input.reminderDate,
      reminderTime: input.reminderTime,
      followUpBy: '',
    },
    metadata: {
      ...note.metadata,
      manual: true,
      rawText: input.rawText,
      workspaceSlug: note.workspaceSlug,
    },
  };
}

@Injectable()
export class UpdateManualNoteUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(input: UpdateManualNoteInput, userId: string) {
    const note = await this.contentRepository.getNoteById(userId, input.id);
    if (!note) throw new NotFoundException('note_not_found');
    if (!isManualEventNote(note)) throw new BadRequestException('note_not_editable');

    const project = await this.contentRepository.getProjectBySlug(userId, note.projectSlug);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const existingReminder = await this.contentRepository.findReminderBySourceNotePath(userId, note.path);
    buildManualEditorState(note, existingReminder);

    const payload = withDerivedReminderAt(buildManualNotePayload(note, project, input));
    const paths = buildNotePaths(project, payload);
    const title = trimText(input.title, input.rawText);
    const updatedEvent = await this.contentRepository.upsertNote(userId, {
      ...note,
      title,
      tags: payload.classification.tags,
      summary: payload.content.sections.summary || input.rawText,
      markdown: renderEventNote(project, payload, paths),
      frontmatter: {
        ...note.frontmatter,
        type: CanonicalType.Event,
        workspace: note.workspaceSlug,
        source_channel: note.sourceChannel,
        event_type: payload.event.type,
        project: project.projectSlug,
        status: note.status,
        tags: payload.classification.tags,
        occurred_at: note.occurredAt,
      },
      metadata: {
        ...note.metadata,
        manual: true,
        rawText: input.rawText,
        eventType: payload.event.type,
        impact: '',
        reviewFindings: [],
        reminderDate: payload.actions.reminderDate,
        reminderTime: payload.actions.reminderTime,
        reminderAt: payload.actions.reminderAt,
      },
      links: [existingReminder?.path].filter(Boolean) as string[],
    });

    let reminderNoteId = '';
    if (payload.actions.reminderDate) {
      const reminderPath = existingReminder?.path || paths.reminderRelativePath.replace(/\\/g, '/');
      const reminder = await this.contentRepository.upsertNote(userId, {
        id: existingReminder?.id,
        path: reminderPath,
        type: CanonicalType.Reminder,
        title: `Reminder ${title}`,
        projectSlug: updatedEvent.projectSlug,
        workspaceSlug: updatedEvent.workspaceSlug,
        status: KnowledgeStatus.Open,
        tags: payload.classification.tags,
        occurredAt: payload.actions.reminderAt || payload.actions.reminderDate,
        sourceChannel: updatedEvent.sourceChannel,
        summary: title,
        markdown: renderReminderNote(project, payload, updatedEvent.path, payload.actions.reminderAt || payload.actions.reminderDate),
        frontmatter: {
          id: String(note.frontmatter.id || `manual:${note.id}`),
          type: CanonicalType.Reminder,
          workspace: updatedEvent.workspaceSlug,
          project: updatedEvent.projectSlug,
          status: KnowledgeStatus.Open,
          reminder_date: payload.actions.reminderDate,
          reminder_time: payload.actions.reminderTime,
          reminder_at: payload.actions.reminderAt,
        },
        metadata: {
          sourceNotePath: updatedEvent.path,
          reminderDate: payload.actions.reminderDate,
          reminderTime: payload.actions.reminderTime,
          reminderAt: payload.actions.reminderAt,
        },
        origin: updatedEvent.origin,
        source: updatedEvent.source,
        links: [updatedEvent.path],
      });
      reminderNoteId = reminder.id;
      await this.contentRepository.upsertNote(userId, {
        ...updatedEvent,
        links: [reminder.path],
      });
    } else if (existingReminder) {
      await this.contentRepository.deleteNote(userId, existingReminder.id);
      await this.contentRepository.upsertNote(userId, {
        ...updatedEvent,
        links: [],
      });
    }

    return { ok: true as const, noteId: updatedEvent.id, reminderNoteId };
  }
}

@Injectable()
export class DeleteManualNoteUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(id: string, userId: string) {
    const note = await this.contentRepository.getNoteById(userId, id);
    if (!note) throw new NotFoundException('note_not_found');
    if (!isManualEventNote(note)) throw new BadRequestException('note_not_deletable');

    const reminder = await this.contentRepository.findReminderBySourceNotePath(userId, note.path);
    if (reminder) await this.contentRepository.deleteNote(userId, reminder.id);
    await this.contentRepository.deleteNote(userId, note.id);

    return { ok: true as const, noteId: note.id, reminderNoteId: reminder?.id || '' };
  }
}
