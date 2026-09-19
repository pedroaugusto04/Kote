import { z } from 'zod';

import { KnowledgeStatus } from '../../../contracts/enums.js';
import { paginationInputSchema } from '../../../contracts/pagination.js';
import { reminderListStatusFilterValues, StatusFilter } from '../../../contracts/status-filters.js';
import { slugifyProjectName, slugifyWorkspaceName } from '../../../domain/strings.js';

export const reviewIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const projectsListQuerySchema = paginationInputSchema.extend({
  selectedSlug: z.string().default(''),
}).transform((input) => ({
  ...input,
  selectedSlug: slugifyProjectName(input.selectedSlug),
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
  workspaceSlug: slugifyWorkspaceName(input.workspaceSlug),
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
  workspaceSlug: slugifyWorkspaceName(input.workspaceSlug),
  projectSlug: slugifyProjectName(input.projectSlug),
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

export const aiAnalyticsQuerySchema = z.object({
  workspaceSlug: z.string().default(''),
  projectSlug: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  model: z.string().default(''),
  provider: z.string().default(''),
}).transform((input) => {
  const normalizeDate = (val?: string) => {
    if (!val) return undefined;
    const trimmed = val.trim();
    if (!trimmed) return undefined;
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : undefined;
  };
  return {
    workspaceSlug: input.workspaceSlug ? slugifyWorkspaceName(input.workspaceSlug) : undefined,
    projectSlug: input.projectSlug ? slugifyProjectName(input.projectSlug) : undefined,
    startDate: normalizeDate(input.startDate),
    endDate: normalizeDate(input.endDate),
    model: input.model && input.model.trim() !== 'all' && input.model.trim() !== '' ? input.model.trim() : undefined,
    provider: input.provider && input.provider.trim() !== 'all' && input.provider.trim() !== '' ? input.provider.trim() : undefined,
  };
});

export type ReminderBoardQuery = z.infer<typeof reminderBoardQuerySchema>;
export type ReminderIdParam = z.infer<typeof reminderIdParamSchema>;
export type ReviewIdParam = z.infer<typeof reviewIdParamSchema>;
export type ProjectsListQuery = z.infer<typeof projectsListQuerySchema>;
export type ReviewsListQuery = z.infer<typeof reviewsListQuerySchema>;
export type RemindersListQuery = z.infer<typeof remindersListQuerySchema>;
export type UpdateReminderStatusBody = z.infer<typeof updateReminderStatusBodySchema>;
export type BulkUpdateReminderStatusBody = z.infer<typeof bulkUpdateReminderStatusBodySchema>;
export type AiAnalyticsQuery = z.infer<typeof aiAnalyticsQuerySchema>;
