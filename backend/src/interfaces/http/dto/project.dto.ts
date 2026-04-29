import { z } from 'zod';

import { slugify } from '../../../domain/strings.js';

function normalizedStringList(value: string[]): string[] {
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

export const createProjectBodySchema = z
  .object({
    displayName: z.string().trim().min(1, 'Informe o nome do projeto.').max(120, 'Use no maximo 120 caracteres.'),
    projectSlug: z.string().trim().max(80, 'Use no maximo 80 caracteres.').optional(),
    repoFullName: z.string().trim().max(180, 'Use no maximo 180 caracteres.').optional().default(''),
    aliases: z.array(z.string().trim().max(80, 'Use no maximo 80 caracteres.')).optional().default([]),
    defaultTags: z.array(z.string().trim().max(60, 'Use no maximo 60 caracteres.')).optional().default([]),
  })
  .strict()
  .transform((body, ctx) => {
    const projectSlug = slugify(body.projectSlug || body.displayName);
    if (!projectSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe um slug valido para o projeto.',
        path: ['projectSlug'],
      });
      return z.NEVER;
    }
    return {
      displayName: body.displayName,
      projectSlug,
      repoFullName: body.repoFullName.trim(),
      aliases: normalizedStringList(body.aliases),
      defaultTags: normalizedStringList(body.defaultTags.map((tag) => slugify(tag)).filter(Boolean)),
    };
  });

export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;

export const projectSlugParamSchema = z.object({
  projectSlug: z.string().trim().min(1).transform((value) => slugify(value)),
});

export const updateProjectBodySchema = z
  .object({
    displayName: z.string().trim().min(1, 'Informe o nome do projeto.').max(120, 'Use no maximo 120 caracteres.'),
    repoFullName: z.string().trim().max(180, 'Use no maximo 180 caracteres.').optional().default(''),
    aliases: z.array(z.string().trim().max(80, 'Use no maximo 80 caracteres.')).optional().default([]),
    defaultTags: z.array(z.string().trim().max(60, 'Use no maximo 60 caracteres.')).optional().default([]),
  })
  .strict()
  .transform((body) => ({
    displayName: body.displayName,
    repoFullName: body.repoFullName.trim(),
    aliases: normalizedStringList(body.aliases),
    defaultTags: normalizedStringList(body.defaultTags.map((tag) => slugify(tag)).filter(Boolean)),
  }));

export type ProjectSlugParam = z.infer<typeof projectSlugParamSchema>;
export type UpdateProjectBody = z.infer<typeof updateProjectBodySchema>;
