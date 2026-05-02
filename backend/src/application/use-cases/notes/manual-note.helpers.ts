import { BadRequestException } from '@nestjs/common';
import { CanonicalType, EventType, Importance, KnowledgeKind, KnowledgeStatus, SourceChannel } from '../../../contracts/enums.js';
import type { IngestPayload } from '../../../contracts/ingest.js';
import type { Project } from '../../../domain/projects.js';
import { trimText } from '../../../domain/strings.js';
import type { NoteRecord } from '../../models/repository-records.models.js';

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

export function buildManualNotePayload(note: NoteRecord, project: Project, input: {
  title: string;
  rawText: string;
  tags: string[];
  reminderDate: string;
  reminderTime: string;
  reminderAt?: string;
}): IngestPayload {
  return {
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
      reminderAt: input.reminderAt || '',
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

export function requireEditableManualNoteRawText(note: NoteRecord) {
  const rawText = String(note.metadata.rawText || '').trim();
  if (!rawText) throw new BadRequestException('note_raw_text_missing');
  return rawText;
}
