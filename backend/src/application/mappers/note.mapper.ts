import crypto from 'node:crypto';

import { EventType, Importance, KnowledgeKind, SourceChannel } from '../../contracts/enums.js';
import type { IngestPayload } from '../../contracts/ingest.js';
import { hasReminder, normalizeManualNoteStatus } from '../../domain/note-status.js';
import { isAiSource } from '../../domain/notes.js';
import { resolveCanonicalTypeFromCategories } from '../../domain/note-classification.js';
import type { CategoryRecord } from '../models/repository-records.models.js';
import type { CreateManualNoteDto } from '../dto/note.dto.js';
import { stripTitleHeader } from '../use-cases/notes/note-editor.helpers.js';
import { parseSourceChannelString } from '../utils/source-channel.utils.js';

export interface NoteMapperContext {
  categories: CategoryRecord[];
  projectSlug: string;
  workspaceSlug: string;
  reminderTimeZone: string;
}

export function toIngestPayload(
  dto: CreateManualNoteDto,
  context: NoteMapperContext,
  existingNoteId?: string,
): IngestPayload {
  const reminderAt = dto.reminderAt || '';
  const categoryIds = dto.categoryIds || [];
  const canonicalType = resolveCanonicalTypeFromCategories(context.categories, categoryIds);
  const status = normalizeManualNoteStatus({
    requestedStatus: dto.status,
    currentStatus: 'active',
    hadReminder: false,
    hasReminder: hasReminder({ reminderAt }),
  });
  const occurredAt = dto.occurredAt || new Date().toISOString();
  const cleanedRawText = stripTitleHeader(dto.rawText, dto.title);
  const activeSource = dto.source?.trim();
  const isAiChat = isAiSource(activeSource);

  return {
    source: {
      channel: parseSourceChannelString(dto.sourceChannel),
      system: activeSource || 'manual-api',
      source: '',
      actor: '',
      conversationId: context.workspaceSlug,
      correlationId: existingNoteId || `manual:${crypto.randomUUID()}`,
      sessionId: dto.sessionId || '',
    },
    event: {
      type: EventType.ManualNote,
      occurredAt,
      projectSlug: context.projectSlug,
    },
    content: {
      rawText: cleanedRawText,
      title: dto.title,
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
      tags: dto.tags,
      decisionFlag: false,
    },
    actions: {
      reminderAt,
      followUpBy: '',
    },
    metadata: {
      rawText: dto.rawText,
      ...(dto.metadata || {}),
    },
  };
}
