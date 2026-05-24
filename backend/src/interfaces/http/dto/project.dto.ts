import { z } from 'zod';

import { slugify } from '../../../domain/strings.js';
import { paginationInputSchema } from '../../../contracts/pagination.js';
import { projectTimelineCategories } from '../../../application/models/project-timeline.models.js';
import {
  normalizedSlugList,
  optionalStringArraySchema,
  repositoryIdsSchema,
} from './dto-normalizers.js';

export const createProjectBodySchema = z
  .object({
    displayName: z.string().trim().min(1, 'Informe o nome do projeto.').max(120, 'Use no maximo 120 caracteres.'),
    projectSlug: z.string().trim().max(80, 'Use no maximo 80 caracteres.').optional(),
    repositoryIds: repositoryIdsSchema,
    defaultTags: optionalStringArraySchema(60, 'Use no maximo 60 caracteres.'),
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
  category: z.enum(projectTimelineCategories).default('all'),
  folderId: z.string().trim().optional(),
});

export const projectKnowledgeMapQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(150).default(80),
  category: z.enum(projectTimelineCategories).default('all'),
  folderId: z.string().trim().optional(),
});

export const updateProjectBodySchema = z
  .object({
    displayName: z.string().trim().min(1, 'Informe o nome do projeto.').max(120, 'Use no maximo 120 caracteres.'),
    repositoryIds: repositoryIdsSchema,
    defaultTags: optionalStringArraySchema(60, 'Use no maximo 60 caracteres.'),
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

export const projectFolderIdParamSchema = z.object({
  projectSlug: z.string().trim().min(1).transform((value) => slugify(value)),
  folderId: z.string().trim().min(1),
});

export const createProjectFolderBodySchema = z
  .object({
    displayName: z.string().trim().min(1, 'Informe o nome da pasta.').max(120, 'Use no maximo 120 caracteres.'),
    parentFolderId: z.string().trim().optional().default(''),
  })
  .strict()
  .transform((body) => ({
    displayName: body.displayName,
    parentFolderId: body.parentFolderId.trim() || undefined,
  }));

export const updateProjectFolderBodySchema = createProjectFolderBodySchema;

export type ProjectFolderParam = z.infer<typeof projectFolderIdParamSchema>;
export type CreateProjectFolderBody = z.infer<typeof createProjectFolderBodySchema>;
export type UpdateProjectFolderBody = z.infer<typeof updateProjectFolderBodySchema>;

export const setProjectFavoriteBodySchema = z
  .object({
    favorite: z.boolean(),
  })
  .strict();

export type SetProjectFavoriteBody = z.infer<typeof setProjectFavoriteBodySchema>;
