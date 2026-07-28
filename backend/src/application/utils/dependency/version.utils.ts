export function cleanVersion(version: string): string {
  return version.replace(/^[\^~]/, '');
}

/**
 * NPM/Composer Semver prerelease detection
 * Prerelease versions contain a hyphen followed by identifiers (e.g., 1.0.0-alpha, 1.0.0-beta.1)
 */
export function isSemverPrerelease(version: string): boolean {
  const semverPattern = /^(\d+\.\d+\.\d+)(?:-([a-zA-Z0-9.-]+))?$/;
  const match = version.match(semverPattern);
  if (!match) return false;
  return match[2] !== undefined;
}

/**
 * PyPI PEP 440 prerelease detection
 * Prerelease versions: 1.0.0a1, 1.0.0b2, 1.0.0rc1, 1.0.0.dev1, 1.0.0.post1
 */
export function isPipPrerelease(version: string): boolean {
  // PEP 440 prerelease patterns
  const prereleasePatterns = [
    /\.a\d+$/,           // alpha: 1.0.0a1
    /\.b\d+$/,           // beta: 1.0.0b1
    /\.rc\d+$/,          // release candidate: 1.0.0rc1
    /\.alpha\d*$/i,      // alpha: 1.0.0alpha
    /\.beta\d*$/i,       // beta: 1.0.0beta
    /\.dev\d+$/,         // dev: 1.0.0.dev1
    /\.post\d+$/,        // post: 1.0.0.post1
    /-a\d+$/,           // alpha with dash: 1.0.0-a1
    /-b\d+$/,           // beta with dash: 1.0.0-b1
    /-rc\d+$/,          // rc with dash: 1.0.0-rc1
  ];
  
  return prereleasePatterns.some(pattern => pattern.test(version));
}

/**
 * Maven prerelease detection
 * Prerelease versions: 1.0.0-alpha, 1.0.0-beta, 1.0.0-SNAPSHOT, 1.0.0.M1
 */
export function isMavenPrerelease(version: string): boolean {
  const prereleasePatterns = [
    /-alpha\b/i,         // alpha
    /-beta\b/i,          // beta
    /-rc\d*$/i,          // release candidate
    /-SNAPSHOT$/i,       // snapshot
    /-M\d+$/i,           // milestone: 1.0.0-M1
    /-milestone\d*$/i,   // milestone
    /-cr\d*$/i,          // candidate release
  ];
  
  return prereleasePatterns.some(pattern => pattern.test(version));
}

/**
 * Generic prerelease detection for ecosystems without specific patterns
 * Uses common prerelease keywords
 */
export function isGenericPrerelease(version: string): boolean {
  const prereleaseKeywords = ['alpha', 'beta', 'rc', 'snapshot', 'dev', 'pre', 'preview', 'milestone'];
  const lowerVersion = version.toLowerCase();
  return prereleaseKeywords.some(keyword => lowerVersion.includes(keyword));
}
