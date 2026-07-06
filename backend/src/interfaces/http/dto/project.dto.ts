import { z } from 'zod';

import { slugify } from '../../../domain/strings.js';
import { paginationInputSchema, type PaginationInput } from '../../../contracts/pagination.js';
export { paginationInputSchema, type PaginationInput };
import { projectTimelineCategories } from '../../../application/models/project-timeline.models.js';
import { TimelineCategory } from '../../../contracts/enums.js';
import { notesListStatusFilterValues, StatusFilter } from '../../../contracts/status-filters.js';
import {
  normalizedSlugList,
  optionalStringArraySchema,
  repositoryIdsSchema,
} from './dto-normalizers.js';

export const createProjectBodySchema = z
  .object({
    displayName: z.string().trim().min(1, 'Project name is required.').max(120, 'Maximum length is 120 characters.'),
    projectSlug: z.string().trim().max(80, 'Maximum length is 80 characters.').optional(),
    repositoryIds: repositoryIdsSchema,
    defaultTags: optionalStringArraySchema(60, 'Maximum length is 60 characters.'),
  })
  .strict()
  .transform((body) => {
    const projectSlug = slugify(body.projectSlug || body.displayName) || 'inbox';
    return {
      displayName: body.displayName,
      projectSlug,
      repositoryIds: body.repositoryIds,
      defaultTags: normalizedSlugList(body.defaultTags),
    };
  });

export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;

export const projectSlugParamSchema = z.object({
  projectSlug: z.string().trim().min(1).transform((value) => slugify(value)),
});

export const projectTimelineQuerySchema = paginationInputSchema.extend({
  category: z.enum(projectTimelineCategories).default(TimelineCategory.All),
  folderId: z.string().trim().optional(),
  status: z.enum(notesListStatusFilterValues).default(StatusFilter.Open),
  orderByPin: z.enum(['true', 'false']).transform((val) => val === 'true').default('true'),
});

export const projectKnowledgeMapQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(150).default(80),
  category: z.enum(projectTimelineCategories).default(TimelineCategory.All),
  folderId: z.string().trim().optional(),
});

export const updateProjectBodySchema = z
  .object({
    displayName: z.string().trim().min(1, 'Project name is required.').max(120, 'Maximum length is 120 characters.'),
    repositoryIds: repositoryIdsSchema,
    defaultTags: optionalStringArraySchema(60, 'Maximum length is 60 characters.'),
  })
  .strict()
  .transform((body) => ({
    displayName: body.displayName,
    repositoryIds: body.repositoryIds,
    defaultTags: normalizedSlugList(body.defaultTags),
  }));

export type ProjectSlugParam = z.infer<typeof projectSlugParamSchema>;
export type ProjectTimelineQuery = z.infer<typeof projectTimelineQuerySchema>;
export type ProjectKnowledgeMapQuery = z.infer<typeof projectKnowledgeMapQuerySchema>;
export type UpdateProjectBody = z.infer<typeof updateProjectBodySchema>;

export const createProjectFolderBodySchema = z
  .object({
    displayName: z.string().trim().min(1, 'Folder name is required.').max(120, 'Maximum length is 120 characters.'),
    parentFolderId: z.string().trim().optional().default(''),
  })
  .strict()
  .transform((body) => ({
    displayName: body.displayName,
    parentFolderId: body.parentFolderId.trim() || undefined,
  }));

export const updateProjectFolderBodySchema = createProjectFolderBodySchema;

export type CreateProjectFolderBody = z.infer<typeof createProjectFolderBodySchema>;
export type UpdateProjectFolderBody = z.infer<typeof updateProjectFolderBodySchema>;

export const setProjectFavoriteBodySchema = z
  .object({
    favorite: z.boolean(),
  })
  .strict();

export type SetProjectFavoriteBody = z.infer<typeof setProjectFavoriteBodySchema>;
