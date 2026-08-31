export const SPECIAL_PROJECT_SLUGS = {
  INBOX: 'inbox',
  ALL_PROJECTS: 'all projects',
  AUTO: 'auto',
} as const;

export type SpecialProjectSlug = (typeof SPECIAL_PROJECT_SLUGS)[keyof typeof SPECIAL_PROJECT_SLUGS];

/**
 * Resolves the target project slug for note creation or query operations.
 * If the selected slug is empty, "inbox", "all projects", or "auto" (case-insensitive),
 * it maps to "inbox" (or fallback defaultSlug).
 */
export function resolveProjectSlug(projectSlug: string | null | undefined, defaultSlug?: string): string {
  let slug = projectSlug;
  if (!slug || slug.trim().toLowerCase() === 'auto' || slug.trim().toLowerCase() === SPECIAL_PROJECT_SLUGS.ALL_PROJECTS) {
    slug = defaultSlug || SPECIAL_PROJECT_SLUGS.INBOX;
  }
  const trimmed = slug.trim().toLowerCase();
  if (trimmed === '' || trimmed === SPECIAL_PROJECT_SLUGS.INBOX || trimmed === SPECIAL_PROJECT_SLUGS.ALL_PROJECTS || trimmed === 'auto') {
    return SPECIAL_PROJECT_SLUGS.INBOX;
  }
  return slug;
}
