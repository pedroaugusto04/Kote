import { z } from 'zod';

const optionalSlugSchema = z.string().trim().max(80, 'Use at most 80 characters.').refine((value) => !value || /^[a-z0-9._-]+$/.test(value), 'Use only lowercase letters, numbers, dots, hyphens, or underscores.');

export const projectFormSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter the project name.').max(120, 'Use at most 120 characters.'),
  projectSlug: optionalSlugSchema,
  repositoryIds: z.array(z.string().trim().min(1, 'Select a valid GitHub repository.')),
  defaultTags: z.array(z.string().trim().max(50)).max(10),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

export const folderFormSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter the folder name.').max(120, 'Use at most 120 characters.'),
  parentFolderId: z.string(),
});

export type FolderFormValues = z.infer<typeof folderFormSchema>;

export const noteFormSchema = z.object({
  folderId: z.string(),
  categoryIds: z.array(z.string()),
  title: z.string().trim().max(160, 'Use at most 160 characters.'),
  rawText: z.string().trim().min(1, 'Enter the note text.').max(500000, 'Use at most 500000 characters.'),
  tags: z.array(z.string().trim().max(50)).max(10),
  reminderAt: z.string().optional(),
  attachments: z.array(z.any()).optional(),
});

export type NoteFormValues = z.infer<typeof noteFormSchema>;
