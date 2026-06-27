import { z } from 'zod';

import { KnowledgeStatus } from '../../../contracts/enums.js';
import { paginationInputSchema } from '../../../contracts/pagination.js';
import { notesListStatusFilterValues, reminderListStatusFilterValues, StatusFilter } from '../../../contracts/status-filters.js';
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
  status: z.enum(notesListStatusFilterValues).default(StatusFilter.Open),
  selectedId: z.string().default(''),
}).transform((input) => ({
  ...input,
  workspaceSlug: slugify(input.workspaceSlug),
  projectSlug: slugify(input.projectSlug),
  folderId: input.folderId.trim(),
  status: input.status.trim().toLowerCase(),
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
  status: z.enum(reminderListStatusFilterValues).default(StatusFilter.Open),
}).transform((input) => ({
  ...input,
  workspaceSlug: slugify(input.workspaceSlug),
  status: input.status.trim().toLowerCase(),
}));

export const reminderBoardQuerySchema = z.object({
  workspaceSlug: z.string().default(''),
  projectSlug: z.string().default(''),
  limitPerColumn: z.coerce.number().int().min(1).max(50).default(50),
  overduePage: z.coerce.number().int().min(1).default(1),
  upcomingPage: z.coerce.number().int().min(1).default(1),
  resolvedPage: z.coerce.number().int().min(1).default(1),
  archivedPage: z.coerce.number().int().min(1).default(1),
}).transform((input) => ({
  workspaceSlug: slugify(input.workspaceSlug),
  projectSlug: slugify(input.projectSlug),
  limitPerColumn: input.limitPerColumn,
  columnPage: {
    overdue: input.overduePage,
    upcoming: input.upcomingPage,
    resolved: input.resolvedPage,
    archived: input.archivedPage,
  },
}));

export const reminderIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const updateReminderStatusBodySchema = z.object({
  status: z.nativeEnum(KnowledgeStatus),
});

export const bulkUpdateReminderStatusBodySchema = z.object({
  ids: z.array(z.string().trim().min(1)),
  status: z.nativeEnum(KnowledgeStatus),
});

export type NoteIdParam = z.infer<typeof noteIdParamSchema>;
export type ReminderBoardQuery = z.infer<typeof reminderBoardQuerySchema>;
export type ReminderIdParam = z.infer<typeof reminderIdParamSchema>;
export type ReviewIdParam = z.infer<typeof reviewIdParamSchema>;
export type ProjectsListQuery = z.infer<typeof projectsListQuerySchema>;
export type NotesListQuery = z.infer<typeof notesListQuerySchema>;
export type ReviewsListQuery = z.infer<typeof reviewsListQuerySchema>;
export type RemindersListQuery = z.infer<typeof remindersListQuerySchema>;
export type UpdateReminderStatusBody = z.infer<typeof updateReminderStatusBodySchema>;
export type BulkUpdateReminderStatusBody = z.infer<typeof bulkUpdateReminderStatusBodySchema>;
