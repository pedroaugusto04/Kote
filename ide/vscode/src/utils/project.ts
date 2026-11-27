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
  const isSpecial = (val?: string | null) => {
    const trimmed = val?.trim().toLowerCase() ?? '';
    return trimmed === '' || trimmed === SPECIAL_PROJECT_SLUGS.AUTO || trimmed === SPECIAL_PROJECT_SLUGS.ALL_PROJECTS || trimmed === SPECIAL_PROJECT_SLUGS.INBOX;
  };

  if (!isSpecial(projectSlug)) {
    return projectSlug!;
  }
  if (!isSpecial(defaultSlug)) {
    return defaultSlug!;
  }
  return SPECIAL_PROJECT_SLUGS.INBOX;
}
