import { RegistryStrategy, type RegistryVersionInfo } from './registry-strategy.interface.js';
import { extractRepositoryUrl } from '../../utils/dependency/repository-url.utils.js';
import { isSemverPrerelease } from '../../utils/dependency/version.utils.js';

export class NpmRegistryStrategy extends RegistryStrategy {
  ecosystem = 'npm';
  private readonly TIMEOUT_MS = 10000;

  constructor(private readonly stableOnly: boolean = true) {
    super();
  }

  async fetchLatestVersion(packageName: string, stableOnly?: boolean): Promise<RegistryVersionInfo> {
    const shouldFilterStable = stableOnly !== undefined ? stableOnly : this.stableOnly;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      // Fetch full package metadata to access dist-tags and all versions
      const response = await fetch(`https://registry.npmjs.org/${packageName}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Kote-DependencyWatcher/1.0',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch npm package: ${response.statusText}`);
      }

      const data = await response.json();
      const repositoryUrl = extractRepositoryUrl(data.repository?.url, data.homepage);

      let version: string;

      if (shouldFilterStable) {
        // Try dist-tags.latest first (most common for stable releases)
        version = data['dist-tags']?.latest;
        
        // Fallback: if dist-tags.latest is prerelease or missing, find latest stable from versions
        if (!version || isSemverPrerelease(version)) {
          const versions = data.versions ? Object.keys(data.versions) : [];
          const stableVersions = versions.filter(v => !isSemverPrerelease(v));
          
          if (stableVersions.length > 0) {
            // Sort versions semantically and get the latest
            stableVersions.sort((a, b) => this.compareSemver(a, b));
            version = stableVersions[stableVersions.length - 1];
          } else if (versions.length > 0) {
            // No stable versions found, use the latest version as fallback
            versions.sort((a, b) => this.compareSemver(a, b));
            version = versions[versions.length - 1];
          } else {
            throw new Error(`No versions found for package ${packageName}`);
          }
        }
      } else {
        // Include prereleases: use dist-tags.latest or fallback to highest version
        version = data['dist-tags']?.latest;
        if (!version) {
          const versions = data.versions ? Object.keys(data.versions) : [];
          if (versions.length === 0) {
            throw new Error(`No versions found for package ${packageName}`);
          }
          versions.sort((a, b) => this.compareSemver(a, b));
          version = versions[versions.length - 1];
        }
      }

      return {
        version,
        repositoryUrl: repositoryUrl || undefined,
        releaseNotes: data.description || undefined,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`npm registry request timeout for ${packageName}`);
      }
      throw new Error(`Npm registry fetch failed for ${packageName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Simple semver comparison for sorting versions
   * Assumes valid semver format (major.minor.patch)
   */
  private compareSemver(a: string, b: string): number {
    const parseSemver = (v: string) => {
      const match = v.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (!match) return [0, 0, 0];
      return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
    };

    const [aMajor, aMinor, aPatch] = parseSemver(a);
    const [bMajor, bMinor, bPatch] = parseSemver(b);

    if (aMajor !== bMajor) return aMajor - bMajor;
    if (aMinor !== bMinor) return aMinor - bMinor;
    return aPatch - bPatch;
  }
}
