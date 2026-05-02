import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CanonicalType, KnowledgeStatus } from '../../../contracts/enums.js';
import { withDerivedReminderAt, type IngestPayload } from '../../../contracts/ingest.js';
import { buildNotePaths, renderEventNote, renderReminderNote } from '../../../domain/notes.js';
import type { Project } from '../../../domain/projects.js';
import { trimText } from '../../../domain/strings.js';
import type { NoteRecord } from '../../models/repository-records.models.js';
import type { UpdateManualNoteInput } from '../../models/note-input.models.js';
import { ContentRepository } from '../../ports/content.repository.js';
import { isManualEventNote, requireEditableManualNoteRawText, buildManualNotePayload } from './manual-note.helpers.js';

@Injectable()
export class UpdateManualNoteUseCase {
  constructor(private readonly contentRepository: ContentRepository) {}

  async execute(input: UpdateManualNoteInput, userId: string) {
    const { note, project, existingReminder } = await this.loadEditableManualNote(userId, input.id);
    const { payload, paths, title } = this.buildUpdatePayload(note, project, input);
    const updatedEvent = await this.persistManualEvent(userId, note, project, existingReminder, payload, paths, title, input.rawText);
    const reminderNoteId = await this.syncReminderSibling(userId, note, project, updatedEvent, existingReminder, payload, paths, title);
    return { ok: true as const, noteId: updatedEvent.id, reminderNoteId };
  }

  private async loadEditableManualNote(userId: string, noteId: string) {
    const note = await this.contentRepository.getNoteById(userId, noteId);
    if (!note) throw new NotFoundException('note_not_found');
    if (!isManualEventNote(note)) throw new BadRequestException('note_not_editable');

    const project = await this.contentRepository.getProjectBySlug(userId, note.projectSlug);
    if (!project || !project.enabled) throw new NotFoundException('project_not_found');

    const existingReminder = await this.contentRepository.findReminderBySourceNotePath(userId, note.path);
    requireEditableManualNoteRawText(note);
    return { note, project, existingReminder };
  }

  private buildUpdatePayload(note: NoteRecord, project: Project, input: UpdateManualNoteInput) {
    const payload = withDerivedReminderAt(buildManualNotePayload(note, project, input));
    return {
      payload,
      paths: buildNotePaths(project, payload),
      title: trimText(input.title, input.rawText),
    };
  }

  private async persistManualEvent(
    userId: string,
    note: NoteRecord,
    project: Project,
    existingReminder: NoteRecord | null,
    payload: IngestPayload,
    paths: ReturnType<typeof buildNotePaths>,
    title: string,
    rawText: string,
  ) {
    return this.contentRepository.upsertNote(userId, {
      ...note,
      title,
      tags: payload.classification.tags,
      summary: payload.content.sections.summary || rawText,
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
        rawText,
        eventType: payload.event.type,
        impact: '',
        reviewFindings: [],
        reminderDate: payload.actions.reminderDate,
        reminderTime: payload.actions.reminderTime,
        reminderAt: payload.actions.reminderAt,
      },
      links: existingReminder ? [existingReminder.path] : [],
    });
  }

  private async syncReminderSibling(
    userId: string,
    note: NoteRecord,
    project: Project,
    updatedEvent: NoteRecord,
    existingReminder: NoteRecord | null,
    payload: IngestPayload,
    paths: ReturnType<typeof buildNotePaths>,
    title: string,
  ) {
    if (payload.actions.reminderDate) {
      return this.upsertReminderSibling(userId, note, project, updatedEvent, existingReminder, payload, paths, title);
    }
    if (existingReminder) {
      await this.deleteReminderSibling(userId, existingReminder, updatedEvent);
    }
    return '';
  }

  private async upsertReminderSibling(
    userId: string,
    note: NoteRecord,
    project: Project,
    updatedEvent: NoteRecord,
    existingReminder: NoteRecord | null,
    payload: IngestPayload,
    paths: ReturnType<typeof buildNotePaths>,
    title: string,
  ) {
    const reminderAt = payload.actions.reminderAt || payload.actions.reminderDate;
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
      occurredAt: reminderAt,
      sourceChannel: updatedEvent.sourceChannel,
      summary: title,
      markdown: renderReminderNote(project, payload, updatedEvent.path, reminderAt),
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
    await this.contentRepository.upsertNote(userId, {
      ...updatedEvent,
      links: [reminder.path],
    });
    return reminder.id;
  }

  private async deleteReminderSibling(userId: string, existingReminder: NoteRecord, updatedEvent: NoteRecord) {
    await this.contentRepository.deleteNote(userId, existingReminder.id);
    await this.contentRepository.upsertNote(userId, {
      ...updatedEvent,
      links: [],
    });
  }
}
