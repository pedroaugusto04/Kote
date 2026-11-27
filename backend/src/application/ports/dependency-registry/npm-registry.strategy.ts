import { RegistryStrategy, type RegistryVersionInfo } from './registry-strategy.interface.js';
import { RegistryPackageNotFoundException } from '../../../domain/exceptions/index.js';
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

    return this.withRegistryErrorHandling('npm registry', packageName, async () => {
      const data = await this.fetchRegistryJson<any>(`https://registry.npmjs.org/${packageName}`, {
        registryName: 'npm registry',
        packageName,
        timeoutMs: this.TIMEOUT_MS,
        buildStatusError: (response) => response.statusText || `HTTP ${response.status}`,
      });
      const repositoryUrl = extractRepositoryUrl(data.repository?.url, data.homepage);

      let version: string | undefined = data['dist-tags']?.latest;
      if (!version || (shouldFilterStable && isSemverPrerelease(version))) {
        const versions = data.versions ? Object.keys(data.versions) : [];
        const stableVersions = shouldFilterStable ? versions.filter((v) => !isSemverPrerelease(v)) : [];
        const pool = stableVersions.length > 0 ? stableVersions : versions;
        if (pool.length === 0) {
          throw new RegistryPackageNotFoundException('npm registry', packageName);
        }
        pool.sort((a, b) => this.compareSemver(a, b));
        version = pool[pool.length - 1];
      }

      return {
        version,
        repositoryUrl: repositoryUrl || undefined,
        releaseNotes: data.description || undefined,
      };
    });
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
