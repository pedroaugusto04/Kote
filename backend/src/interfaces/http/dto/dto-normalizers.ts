import { z } from 'zod';

import { slugifyTagName, unique } from '../../../domain/strings.js';

export function optionalStringArraySchema(maxLength: number, message: string) {
  return z.array(z.string().trim().max(maxLength, message)).optional().default([]);
}

export const repositoryIdsSchema = z
  .array(
    z.union([z.string(), z.number()])
      .transform((value) => String(value).trim())
      .pipe(z.string().min(1, 'Select a valid GitHub repository.')),
  )
  .optional()
  .default([]);

export function normalizedStringList(values: readonly string[]): string[] {
  return unique(values.map((value) => value.trim()).filter(Boolean));
}

export function normalizedSlugList(values: readonly string[]): string[] {
  return normalizedStringList(values.map((value) => slugifyTagName(value)).filter(Boolean));
}
