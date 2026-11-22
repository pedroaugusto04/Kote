/**
 * Repository URL utilities for dependency registries
 * Handles various URL patterns from different package managers
 */

/**
 * Checks whether a given URL points to a trusted git repository host (GitHub or GitLab).
 */
export function isTrustedRepositoryUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const candidate = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
    const hostname = new URL(candidate).hostname.toLowerCase();
    return (
      hostname === 'github.com' ||
      hostname.endsWith('.github.com') ||
      hostname === 'gitlab.com' ||
      hostname.endsWith('.gitlab.com')
    );
  } catch {
    return false;
  }
}

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
  if (homepage && isTrustedRepositoryUrl(homepage)) {
    return homepage;
  }
  return '';
}
