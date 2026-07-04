import { z } from 'zod';

import { KnowledgeStatus, SourceChannel } from '../../../contracts/enums.js';
import { noteStatusValues } from '../../../domain/note-status.js';
import { slugify } from '../../../domain/strings.js';
import { normalizeTime } from '../../../domain/time.js';
import { AUTO_ACTION_NONE, AUTO_ACTION_RESOLVED, AUTO_ACTION_ARCHIVED } from '../../../domain/auto-action.constants.js';
import { normalizedSlugList, optionalStringArraySchema } from './dto-normalizers.js';
import { paginationInputSchema } from '../../../contracts/pagination.js';
import { notesListStatusFilterValues, StatusFilter } from '../../../contracts/status-filters.js';

const noteStatusSchema = z.enum(noteStatusValues).optional();
const editableNoteStatusSchema = z.enum([KnowledgeStatus.Active, KnowledgeStatus.Resolved, KnowledgeStatus.Archived]).optional();

const noteAttachmentSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().default('application/octet-stream'),
  sizeBytes: z.number().int().nonnegative().default(0),
  dataBase64: z.string().default(''),
});

export const createNoteBodySchema = z
  .object({
    projectSlug: z.string().trim().min(1, 'Enter the project.'),
    folderId: z.string().trim().optional().default(''),
    title: z.string().trim().max(160, 'Use at most 160 characters.').optional().default(''),
    rawText: z.string().trim().min(1, 'Enter the note text.').max(500000, 'Use at most 500000 characters.'),
    tags: optionalStringArraySchema(60, 'Use at most 60 characters.'),
    status: noteStatusSchema,
    categoryIds: z.array(z.string()).optional().default([]),
    reminderAt: z.string().trim().optional().default(''),
    sourceChannel: z.string().trim().optional(),
    source: z.string().trim().optional(),
    sessionId: z.string().trim().optional(),
    occurredAt: z.string().trim().optional(),
    path: z.string().trim().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    attachments: z.array(noteAttachmentSchema).optional(),
  })
  .strict()
  .transform((body) => ({
    projectSlug: slugify(body.projectSlug) || 'inbox',
    folderId: body.folderId.trim() || undefined,
    title: body.title,
    rawText: body.rawText,
    tags: normalizedSlugList(body.tags),
    status: body.status,
    categoryIds: body.categoryIds,
    reminderAt: body.reminderAt,
    sourceChannel: body.sourceChannel,
    source: body.source,
    sessionId: body.sessionId,
    occurredAt: body.occurredAt,
    path: body.path,
    metadata: body.metadata,
    attachments: body.attachments,
  }));

export type CreateNoteBody = z.infer<typeof createNoteBodySchema>;

export const noteIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const noteAttachmentContentParamSchema = z.object({
  noteId: z.string().trim().min(1),
  attachmentId: z.string().trim().min(1),
});

export const updateNoteBodySchema = z
  .object({
    projectSlug: z.string().trim().optional(),
    folderId: z.string().trim().optional().default(''),
    title: z.string().trim().max(160, 'Use at most 160 characters.').optional().default(''),
    rawText: z.string().trim().min(1, 'Enter the note text.').max(500000, 'Use at most 500000 characters.'),
    tags: optionalStringArraySchema(60, 'Use at most 60 characters.'),
    status: editableNoteStatusSchema,
    categoryIds: z.array(z.string()).optional(),
    reminderAt: z.string().trim().optional().default(''),
  })
  .strict()
  .transform((body) => ({
    folderId: body.folderId.trim() || undefined,
    title: body.title,
    rawText: body.rawText,
    tags: normalizedSlugList(body.tags),
    status: body.status,
    categoryIds: body.categoryIds,
    reminderAt: body.reminderAt,
  }));

export type NoteIdParam = z.infer<typeof noteIdParamSchema>;
export type NoteAttachmentContentParam = z.infer<typeof noteAttachmentContentParamSchema>;
export type UpdateNoteBody = z.infer<typeof updateNoteBodySchema>;

export const autoActionGlobalSchema = z.object({
  enabled: z.boolean(),
  action: z.enum([AUTO_ACTION_NONE, AUTO_ACTION_RESOLVED, AUTO_ACTION_ARCHIVED]),
  afterHours: z.number().int().optional().nullable(),
}).strict();
export type AutoActionGlobal = z.infer<typeof autoActionGlobalSchema>;

export const pinNoteBodySchema = z.object({
  pinned: z.boolean(),
});
export type PinNoteBody = z.infer<typeof pinNoteBodySchema>;

export const bulkUpdateNoteStatusBodySchema = z.object({
  ids: z.array(z.string().trim().min(1)),
  status: z.enum([KnowledgeStatus.Active, KnowledgeStatus.Resolved, KnowledgeStatus.Archived]),
});
export type BulkUpdateNoteStatusBody = z.infer<typeof bulkUpdateNoteStatusBodySchema>;

export const notesByFileQuerySchema = z.object({
  filePath: z.string().trim().min(1, 'filePath is required'),
});
export type NotesByFileQuery = z.infer<typeof notesByFileQuerySchema>;

export const notesListQuerySchema = paginationInputSchema.extend({
  folderId: z.string().default(''),
  status: z.enum(notesListStatusFilterValues).default(StatusFilter.Open),
  selectedId: z.string().default(''),
}).transform((input) => ({
  ...input,
  folderId: input.folderId.trim(),
  status: input.status.trim().toLowerCase(),
  selectedId: input.selectedId.trim(),
}));
export type NotesListQuery = z.infer<typeof notesListQuerySchema>;


