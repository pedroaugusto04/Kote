import { z } from 'zod';

import { CanonicalType, KnowledgeStatus, SourceChannel } from '../../../contracts/enums.js';
import { noteStatusValues } from '../../../domain/note-status.js';
import { slugify } from '../../../domain/strings.js';
import { normalizeTime } from '../../../domain/time.js';
import { normalizedSlugList, optionalStringArraySchema } from './dto-normalizers.js';

const noteStatusSchema = z.enum(noteStatusValues).optional();
const editableNoteStatusSchema = z.enum([KnowledgeStatus.Active, KnowledgeStatus.Resolved, KnowledgeStatus.Archived]).optional();
const canonicalTypeSchema = z.nativeEnum(CanonicalType).optional().default(CanonicalType.Event);

export const createNoteBodySchema = z
  .object({
    projectSlug: z.string().trim().min(1, 'Enter the project.'),
    folderId: z.string().trim().optional().default(''),
    title: z.string().trim().max(160, 'Use at most 160 characters.').optional().default(''),
    rawText: z.string().trim().min(1, 'Enter the note text.').max(500000, 'Use at most 500000 characters.'),
    tags: optionalStringArraySchema(60, 'Use at most 60 characters.'),
    status: noteStatusSchema,
    canonicalType: canonicalTypeSchema,
    reminderDate: z.string().trim().optional().default(''),
    reminderTime: z.string().trim().optional().default(''),
    reminderAt: z.string().trim().optional().default(''),
    sourceChannel: z.nativeEnum(SourceChannel).optional(),
    source: z.string().trim().optional(),
    sessionId: z.string().trim().optional(),
  })
  .strict()
  .transform((body) => ({
    projectSlug: slugify(body.projectSlug) || 'inbox',
    folderId: body.folderId.trim() || undefined,
    title: body.title,
    rawText: body.rawText,
    tags: normalizedSlugList(body.tags),
    status: body.status,
    canonicalType: body.canonicalType,
    reminderDate: body.reminderDate.trim(),
    reminderTime: normalizeTime(body.reminderTime),
    reminderAt: body.reminderAt,
    sourceChannel: body.sourceChannel,
    source: body.source,
    sessionId: body.sessionId,
  }))
  .superRefine((body, ctx) => {
    if (body.reminderTime && !body.reminderDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reminderTime'],
        message: 'Enter the reminder date before the time.',
      });
    }
  });

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
    folderId: z.string().trim().optional().default(''),
    title: z.string().trim().max(160, 'Use at most 160 characters.').optional().default(''),
    rawText: z.string().trim().min(1, 'Enter the note text.').max(500000, 'Use at most 500000 characters.'),
    tags: optionalStringArraySchema(60, 'Use at most 60 characters.'),
    status: editableNoteStatusSchema,
    canonicalType: canonicalTypeSchema,
    reminderDate: z.string().trim().optional().default(''),
    reminderTime: z.string().trim().optional().default(''),
    reminderAt: z.string().trim().optional().default(''),
  })
  .strict()
  .transform((body) => ({
    folderId: body.folderId.trim() || undefined,
    title: body.title,
    rawText: body.rawText,
    tags: normalizedSlugList(body.tags),
    status: body.status,
    canonicalType: body.canonicalType,
    reminderDate: body.reminderDate.trim(),
    reminderTime: normalizeTime(body.reminderTime),
    reminderAt: body.reminderAt,
  }))
  .superRefine((body, ctx) => {
    if (body.reminderTime && !body.reminderDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reminderTime'],
        message: 'Enter the reminder date before the time.',
      });
    }
  });

export type NoteIdParam = z.infer<typeof noteIdParamSchema>;
export type NoteAttachmentContentParam = z.infer<typeof noteAttachmentContentParamSchema>;
export type UpdateNoteBody = z.infer<typeof updateNoteBodySchema>;

export const pinNoteBodySchema = z.object({
  pinned: z.boolean(),
});
export type PinNoteBody = z.infer<typeof pinNoteBodySchema>;

