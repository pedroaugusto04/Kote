/**
 * Repository URL utilities for dependency registries
 * Handles various URL patterns from different package managers
 */

/**
 * Extracts and normalizes repository URLs from various formats
 * @param sourceUrl - Source URL from package metadata
 * @param homepage - Homepage URL from package metadata
 * @returns Normalized repository URL or empty string
 */
export function extractRepositoryUrl(sourceUrl?: string, homepage?: string): string {
  if (sourceUrl) {
    // Handle git@github.com:user/repo.git pattern (SSH)
    const sshPattern = /git@([^:]+):(.+)/;
    const sshMatch = sourceUrl.match(sshPattern);
    if (sshMatch) {
      return `https://${sshMatch[1]}/${sshMatch[2]}`.replace(/\.git$/, '');
    }
    // Handle git+https://github.com/user/repo.git pattern
    return sourceUrl.replace(/^git\+/, '').replace(/\.git$/, '');
  }
  if (homepage && (homepage.includes('github.com') || homepage.includes('gitlab.com'))) {
    return homepage;
  }
  return '';
}
