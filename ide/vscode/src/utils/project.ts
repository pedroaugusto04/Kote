export const SPECIAL_PROJECT_SLUGS = {
  INBOX: 'inbox',
  ALL_PROJECTS: 'all projects',
} as const;

export type SpecialProjectSlug = (typeof SPECIAL_PROJECT_SLUGS)[keyof typeof SPECIAL_PROJECT_SLUGS];

/**
 * Resolves the target project slug for note creation or query operations.
 * If the selected slug is empty, "inbox", or "all projects" (case-insensitive),
 * it maps to "inbox".
 */
export function resolveProjectSlug(projectSlug: string | null | undefined, defaultSlug?: string): string {
  const slug = projectSlug || defaultSlug || SPECIAL_PROJECT_SLUGS.INBOX;
  const trimmed = slug.trim().toLowerCase();
  if (trimmed === '' || trimmed === SPECIAL_PROJECT_SLUGS.INBOX || trimmed === SPECIAL_PROJECT_SLUGS.ALL_PROJECTS) {
    return SPECIAL_PROJECT_SLUGS.INBOX;
  }
  return slug;
}
