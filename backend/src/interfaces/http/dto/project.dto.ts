import { z } from 'zod';

import { slugify } from '../../../domain/strings.js';

import { githubRepositoryInputSchema } from './integration-credentials.dto.js';

function normalizedStringList(value: string[]): string[] {
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

export const createProjectBodySchema = z
  .object({
    displayName: z.string().trim().min(1, 'Informe o nome do projeto.').max(120, 'Use no maximo 120 caracteres.'),
    projectSlug: z.string().trim().max(80, 'Use no maximo 80 caracteres.').optional(),
    repositoryIds: z.array(z.string().uuid()).optional().default([]),
    aliases: z.array(z.string().trim().max(80, 'Use no maximo 80 caracteres.')).optional().default([]),
    defaultTags: z.array(z.string().trim().max(60, 'Use no maximo 60 caracteres.')).optional().default([]),
  })
  .strict()
  .transform((body) => {
    const projectSlug = slugify(body.projectSlug || body.displayName) || 'inbox';
    return {
      displayName: body.displayName,
      projectSlug,
      repositoryIds: body.repositoryIds,
      aliases: normalizedStringList(body.aliases),
      defaultTags: normalizedStringList(body.defaultTags.map((tag) => slugify(tag)).filter(Boolean)),
    };
  });

export type CreateProjectBody = {
  displayName: string;
  projectSlug: string;
  repositoryIds: string[];
  aliases: string[];
  defaultTags: string[];
};

export const projectSlugParamSchema = z.object({
  projectSlug: z.string().trim().min(1).transform((value) => slugify(value)),
});

export const updateProjectBodySchema = z
  .object({
    displayName: z.string().trim().min(1, 'Informe o nome do projeto.').max(120, 'Use no maximo 120 caracteres.'),
    repositoryIds: z.array(z.string().uuid()).optional().default([]),
    aliases: z.array(z.string().trim().max(80, 'Use no maximo 80 caracteres.')).optional().default([]),
    defaultTags: z.array(z.string().trim().max(60, 'Use no maximo 60 caracteres.')).optional().default([]),
  })
  .strict()
  .transform((body) => {
    return {
      displayName: body.displayName,
      repositoryIds: body.repositoryIds,
      aliases: normalizedStringList(body.aliases),
      defaultTags: normalizedStringList(body.defaultTags.map((tag) => slugify(tag)).filter(Boolean)),
    };
  });

export type ProjectSlugParam = z.infer<typeof projectSlugParamSchema>;
export type UpdateProjectBody = {
  displayName: string;
  repositoryIds: string[];
  aliases: string[];
  defaultTags: string[];
};
