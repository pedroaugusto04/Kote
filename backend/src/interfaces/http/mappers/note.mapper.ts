import type { CreateNoteBody, UpdateNoteBody } from '../dto/note.dto.js';
import type { CreateManualNoteDto, UpdateNoteDto } from '../../../application/dto/note.dto.js';

export function toCreateManualNoteDto(httpBody: CreateNoteBody, projectId: string): CreateManualNoteDto {
  return {
    projectId,
    folderId: httpBody.folderId || undefined,
    title: httpBody.title,
    rawText: httpBody.rawText,
    tags: httpBody.tags,
    status: httpBody.status,
    categoryIds: httpBody.categoryIds || [],
    reminderAt: httpBody.reminderAt || '',
    sourceChannel: httpBody.sourceChannel,
    source: httpBody.source,
    sessionId: httpBody.sessionId || '',
    occurredAt: httpBody.occurredAt,
    path: httpBody.path,
    metadata: httpBody.metadata || {},
  };
}

export function toUpdateNoteDto(httpBody: UpdateNoteBody, noteId: string, projectId?: string): UpdateNoteDto {
  return {
    id: noteId,
    projectId,
    folderId: httpBody.folderId || undefined,
    title: httpBody.title,
    rawText: httpBody.rawText,
    tags: httpBody.tags,
    status: httpBody.status,
    categoryIds: httpBody.categoryIds,
    reminderAt: httpBody.reminderAt || '',
  };
}
