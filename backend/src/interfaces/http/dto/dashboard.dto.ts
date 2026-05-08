import { z } from 'zod';
import { paginationInputSchema } from '../../../contracts/pagination.js';
import { slugify } from '../../../domain/strings.js';

export const noteIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const reviewIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const projectsListQuerySchema = paginationInputSchema.extend({
  selectedSlug: z.string().default(''),
}).transform((input) => ({
  ...input,
  selectedSlug: slugify(input.selectedSlug),
}));

export const notesListQuerySchema = paginationInputSchema.extend({
  workspaceSlug: z.string().default(''),
  projectSlug: z.string().default(''),
  folderId: z.string().default(''),
  rootOnly: z
    .union([z.boolean(), z.string()])
    .optional()
    .default(false)
    .transform((value) => value === true || value === 'true'),
  selectedId: z.string().default(''),
}).transform((input) => ({
  ...input,
  workspaceSlug: slugify(input.workspaceSlug),
  projectSlug: slugify(input.projectSlug),
  folderId: input.folderId.trim(),
  selectedId: input.selectedId.trim(),
}));

export const reviewsListQuerySchema = paginationInputSchema.extend({
  selectedId: z.string().default(''),
}).transform((input) => ({
  ...input,
  selectedId: input.selectedId.trim(),
}));

export const remindersListQuerySchema = paginationInputSchema.extend({
  workspaceSlug: z.string().default(''),
  status: z.enum(['', 'active', 'expired', 'sent', 'resolved', 'archived']).default(''),
}).transform((input) => ({
  ...input,
  workspaceSlug: slugify(input.workspaceSlug),
  status: input.status.trim().toLowerCase(),
}));

export type NoteIdParam = z.infer<typeof noteIdParamSchema>;
export type ReviewIdParam = z.infer<typeof reviewIdParamSchema>;
export type ProjectsListQuery = z.infer<typeof projectsListQuerySchema>;
export type NotesListQuery = z.infer<typeof notesListQuerySchema>;
export type ReviewsListQuery = z.infer<typeof reviewsListQuerySchema>;
export type RemindersListQuery = z.infer<typeof remindersListQuerySchema>;
