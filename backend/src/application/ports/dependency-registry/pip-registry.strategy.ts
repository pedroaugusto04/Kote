import { RegistryStrategy, type RegistryVersionInfo } from './registry-strategy.interface.js';
import { extractRepositoryUrl } from '../../utils/dependency/repository-url.utils.js';
import { isPipPrerelease } from '../../utils/dependency/version.utils.js';

export class PipRegistryStrategy extends RegistryStrategy {
  ecosystem = 'pip';
  private readonly TIMEOUT_MS = 10000;

  constructor(private readonly stableOnly: boolean = true) {
    super();
  }

  async fetchLatestVersion(packageName: string, stableOnly?: boolean): Promise<RegistryVersionInfo> {
    const shouldFilterStable = stableOnly !== undefined ? stableOnly : this.stableOnly;

    try {
      const data = await this.fetchRegistryJson<any>(
        `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`,
        {
          registryName: 'PyPI',
          packageName,
          timeoutMs: this.TIMEOUT_MS,
        },
      );

      if (!data.info || !data.info.version) {
        throw new Error(`Invalid package data from PyPI for ${packageName}`);
      }

      let latestVersion = data.info.version;
      
      if (shouldFilterStable && isPipPrerelease(latestVersion)) {
        const releases = data.releases ? Object.keys(data.releases) : [];
        const stableVersions = releases.filter((v) => !isPipPrerelease(v));
        const pool = stableVersions.length > 0 ? stableVersions : releases;
        if (pool.length > 0) {
          pool.sort((a, b) => this.comparePep440(a, b));
          latestVersion = pool[0];
        }
      }

      const repositoryUrl = extractRepositoryUrl(data.info.repository_url, data.info.home_page);

      return {
        version: latestVersion,
        repositoryUrl,
        changelog: data.info.summary || '',
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('PyPI request timeout')) {
        throw error;
      }
      throw new Error(`PyPI registry fetch failed for ${packageName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Simple PEP 440 version comparison for sorting
   * Handles basic numeric version parts (e.g., 1.2.3, 1.2.3.4)
   */
  private comparePep440(a: string, b: string): number {
    const parseVersion = (v: string) => {
      // Remove prerelease/postrelease suffixes for comparison
      const cleanV = v.split(/[a-zA-Z.-]/)[0];
      const parts = cleanV.split('.').map(Number);
      return parts.map(p => isNaN(p) ? 0 : p);
    };

    const partsA = parseVersion(a);
    const partsB = parseVersion(b);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;
      if (numA !== numB) return numB - numA;
    }
    return 0;
  }
}
