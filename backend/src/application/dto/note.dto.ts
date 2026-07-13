import { z } from 'zod';

import { noteStatusValues } from '../../domain/note-status.js';
import { KnowledgeStatus } from '../../contracts/enums.js';
import { readEnvironment } from '../../adapters/environment.js';

const noteStatusSchema = z.enum(noteStatusValues).optional();
const editableNoteStatusSchema = z.enum([KnowledgeStatus.Active, KnowledgeStatus.Resolved, KnowledgeStatus.Archived]).optional();

const environment = readEnvironment();
const attachmentMaxSize = environment.attachmentMaxSizeBytes;

const noteAttachmentSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().default('application/octet-stream'),
  sizeBytes: z.number().int().nonnegative().max(attachmentMaxSize, `Attachment must be ${attachmentMaxSize / (1024 * 1024)} MB or smaller.`).default(0),
  dataBase64: z.string().default(''),
});

export const createManualNoteSchema = z
  .object({
    projectId: z.string().min(1, 'projectId is required'),
    folderId: z.string().optional(),
    title: z.string().min(1, 'title is required').max(160, 'title must be at most 160 characters'),
    rawText: z.string().max(500000, 'rawText must be at most 500000 characters').optional().default(''),
    tags: z.array(z.string()).default([]),
    status: noteStatusSchema,
    categoryIds: z.array(z.string()).optional().default([]),
    reminderAt: z.string().optional().default(''),
    sourceChannel: z.string().optional(),
    source: z.string().optional(),
    sessionId: z.string().optional().default(''),
    occurredAt: z.string().optional(),
    path: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
    attachments: z.array(noteAttachmentSchema).optional().default([]),
  })
  .strict();

export type CreateManualNoteDto = z.infer<typeof createManualNoteSchema>;

export const updateNoteSchema = z
  .object({
    id: z.string().min(1, 'id is required'),
    projectId: z.string().optional(),
    folderId: z.string().optional(),
    title: z.string().min(1, 'title is required').max(160, 'title must be at most 160 characters'),
    rawText: z.string().max(500000, 'rawText must be at most 500000 characters').optional().default(''),
    tags: z.array(z.string()).default([]),
    status: editableNoteStatusSchema,
    categoryIds: z.array(z.string()).optional(),
    reminderAt: z.string().optional().default(''),
    attachments: z.array(noteAttachmentSchema).optional(),
  })
  .strict();

export type UpdateNoteDto = z.infer<typeof updateNoteSchema>;
