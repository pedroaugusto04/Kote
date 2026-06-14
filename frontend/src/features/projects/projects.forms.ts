import { z } from 'zod';

import { canonicalNoteTypeValues } from '../../shared/api/models/note';

const optionalSlugSchema = z.string().trim().max(80, 'Use at most 80 characters.').refine((value) => !value || /^[a-z0-9._-]+$/.test(value), 'Use only lowercase letters, numbers, dots, hyphens, or underscores.');

export const projectFormSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter the project name.').max(120, 'Use at most 120 characters.'),
  projectSlug: optionalSlugSchema,
  repositoryIds: z.array(z.string().trim().min(1, 'Select a valid GitHub repository.')),
  defaultTags: z.string().max(500, 'Use at most 500 characters.'),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

export const folderFormSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter the folder name.').max(120, 'Use at most 120 characters.'),
  parentFolderId: z.string(),
});

export type FolderFormValues = z.infer<typeof folderFormSchema>;

export const noteFormSchema = z.object({
  folderId: z.string(),
  canonicalType: z.enum(canonicalNoteTypeValues),
  title: z.string().trim().max(160, 'Use at most 160 characters.'),
  rawText: z.string().trim().min(1, 'Enter the note text.').max(500000, 'Use at most 500000 characters.'),
  tags: z.string().max(500, 'Use at most 500 characters.'),
  reminderDate: z.string(),
  reminderTime: z.string(),
}).superRefine((values, ctx) => {
  if (values.reminderTime && !values.reminderDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reminderTime'],
      message: 'Enter the reminder date before the time.',
    });
  }
});

export type NoteFormValues = z.infer<typeof noteFormSchema>;
