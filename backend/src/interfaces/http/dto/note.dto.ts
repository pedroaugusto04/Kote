import { z } from 'zod';

import { slugify } from '../../../domain/strings.js';
import { normalizeTime } from '../../../domain/time.js';
import { normalizedSlugList, optionalStringArraySchema } from './dto-normalizers.js';

export const createNoteBodySchema = z
  .object({
    projectSlug: z.string().trim().min(1, 'Informe o projeto.'),
    folderId: z.string().trim().optional().default(''),
    title: z.string().trim().max(160, 'Use no maximo 160 caracteres.').optional().default(''),
    rawText: z.string().trim().min(1, 'Informe o texto da nota.').max(20000, 'Use no maximo 20000 caracteres.'),
    tags: optionalStringArraySchema(60, 'Use no maximo 60 caracteres.'),
    reminderDate: z.string().trim().optional().default(''),
    reminderTime: z.string().trim().optional().default(''),
    reminderAt: z.string().trim().optional().default(''),
  })
  .strict()
  .transform((body) => ({
    projectSlug: slugify(body.projectSlug) || 'inbox',
    folderId: body.folderId.trim() || undefined,
    title: body.title,
    rawText: body.rawText,
    tags: normalizedSlugList(body.tags),
    reminderDate: body.reminderDate.trim(),
    reminderTime: normalizeTime(body.reminderTime),
    reminderAt: body.reminderAt,
  }))
  .superRefine((body, ctx) => {
    if (body.reminderTime && !body.reminderDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reminderTime'],
        message: 'Informe a data do lembrete antes da hora.',
      });
    }
  });

export type CreateNoteBody = z.infer<typeof createNoteBodySchema>;

export const noteIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const updateNoteBodySchema = z
  .object({
    folderId: z.string().trim().optional().default(''),
    title: z.string().trim().max(160, 'Use no maximo 160 caracteres.').optional().default(''),
    rawText: z.string().trim().min(1, 'Informe o texto da nota.').max(20000, 'Use no maximo 20000 caracteres.'),
    tags: optionalStringArraySchema(60, 'Use no maximo 60 caracteres.'),
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
    reminderDate: body.reminderDate.trim(),
    reminderTime: normalizeTime(body.reminderTime),
    reminderAt: body.reminderAt,
  }))
  .superRefine((body, ctx) => {
    if (body.reminderTime && !body.reminderDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reminderTime'],
        message: 'Informe a data do lembrete antes da hora.',
      });
    }
  });

export type NoteIdParam = z.infer<typeof noteIdParamSchema>;
export type UpdateNoteBody = z.infer<typeof updateNoteBodySchema>;
