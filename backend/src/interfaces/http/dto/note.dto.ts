import { z } from 'zod';

import { slugify } from '../../../domain/strings.js';
import { normalizeDate, normalizeTime } from '../../../domain/time.js';

export const createNoteBodySchema = z
  .object({
    projectSlug: z.string().trim().min(1, 'Informe o projeto.'),
    title: z.string().trim().max(160, 'Use no maximo 160 caracteres.').optional().default(''),
    rawText: z.string().trim().min(1, 'Informe o texto da nota.').max(20000, 'Use no maximo 20000 caracteres.'),
    tags: z.array(z.string().trim().max(60, 'Use no maximo 60 caracteres.')).optional().default([]),
    reminderDate: z.string().trim().optional().default(''),
    reminderTime: z.string().trim().optional().default(''),
  })
  .strict()
  .transform((body) => ({
    projectSlug: slugify(body.projectSlug) || 'inbox',
    title: body.title,
    rawText: body.rawText,
    tags: [...new Set(body.tags.map((tag) => slugify(tag)).filter(Boolean))],
    reminderDate: normalizeDate(body.reminderDate),
    reminderTime: normalizeTime(body.reminderTime),
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
    title: z.string().trim().max(160, 'Use no maximo 160 caracteres.').optional().default(''),
    rawText: z.string().trim().min(1, 'Informe o texto da nota.').max(20000, 'Use no maximo 20000 caracteres.'),
    tags: z.array(z.string().trim().max(60, 'Use no maximo 60 caracteres.')).optional().default([]),
    reminderDate: z.string().trim().optional().default(''),
    reminderTime: z.string().trim().optional().default(''),
  })
  .strict()
  .transform((body) => ({
    title: body.title,
    rawText: body.rawText,
    tags: [...new Set(body.tags.map((tag) => slugify(tag)).filter(Boolean))],
    reminderDate: normalizeDate(body.reminderDate),
    reminderTime: normalizeTime(body.reminderTime),
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
