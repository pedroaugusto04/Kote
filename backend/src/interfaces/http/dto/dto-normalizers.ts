import { z } from 'zod';

import { slugify, unique } from '../../../domain/strings.js';

export function optionalStringArraySchema(maxLength: number, message: string) {
  return z.array(z.string().trim().max(maxLength, message)).optional().default([]);
}

export const repositoryIdsSchema = z
  .array(
    z.union([z.string(), z.number()])
      .transform((value) => String(value).trim())
      .pipe(z.string().min(1, 'Selecione um repositorio valido do GitHub.')),
  )
  .optional()
  .default([]);

export function normalizedStringList(values: readonly string[]): string[] {
  return unique(values.map((value) => value.trim()).filter(Boolean));
}

export function normalizedSlugList(values: readonly string[]): string[] {
  return normalizedStringList(values.map((value) => slugify(value)).filter(Boolean));
}
