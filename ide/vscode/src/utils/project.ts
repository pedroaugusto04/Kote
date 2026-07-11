/**
 * Resolves the target project slug for note creation or query operations.
 * If the selected slug is empty, "inbox", or "all projects" (case-insensitive),
 * it maps to "inbox".
 */
export function resolveProjectSlug(projectSlug: string | null | undefined, defaultSlug?: string): string {
  const slug = projectSlug || defaultSlug || 'inbox';
  const trimmed = slug.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'inbox' || trimmed === 'all projects') {
    return 'inbox';
  }
  return slug;
}
