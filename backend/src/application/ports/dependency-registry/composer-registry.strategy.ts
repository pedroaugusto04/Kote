import { RegistryStrategy, type RegistryVersionInfo } from './registry-strategy.interface.js';
import { RegistryPackageNotFoundException } from '../../../domain/exceptions/index.js';
import { compare, coerce } from 'semver';
import { extractRepositoryUrl } from '../../utils/dependency/repository-url.utils.js';
import { isSemverPrerelease } from '../../utils/dependency/version.utils.js';

export class ComposerRegistryStrategy extends RegistryStrategy {
  ecosystem = 'composer';
  private readonly TIMEOUT_MS = 10000;

  constructor(private readonly stableOnly: boolean = true) {
    super();
  }

  async fetchLatestVersion(packageName: string, stableOnly?: boolean): Promise<RegistryVersionInfo> {
    const shouldFilterStable = stableOnly !== undefined ? stableOnly : this.stableOnly;

    return this.withRegistryErrorHandling('Packagist', packageName, async () => {
      const data = await this.fetchRegistryJson<{ packages?: Record<string, Record<string, any>> }>(
        `https://repo.packagist.org/p2/${encodeURIComponent(packageName)}.json`,
        {
          registryName: 'Packagist',
          packageName,
          timeoutMs: this.TIMEOUT_MS,
        },
      );

      const packageVersions = data.packages?.[packageName];
      const versions = packageVersions ? Object.keys(packageVersions) : [];
      if (versions.length === 0) {
        throw new RegistryPackageNotFoundException('Packagist', packageName);
      }

      const stableVersions = shouldFilterStable ? versions.filter((v) => !isSemverPrerelease(v)) : [];
      const pool = stableVersions.length > 0 ? stableVersions : versions;
      pool.sort((a, b) => {
        const coercedA = coerce(a);
        const coercedB = coerce(b);
        if (!coercedA || !coercedB) return 0;
        return compare(coercedA, coercedB);
      });

      const latestVersion = pool[pool.length - 1];
      const packageData = packageVersions?.[latestVersion];
      if (!packageData) {
        throw new RegistryPackageNotFoundException('Packagist', packageName);
      }

      return {
        version: latestVersion,
        repositoryUrl: extractRepositoryUrl(packageData.source?.url, packageData.homepage),
        changelog: packageData.description || '',
      };
    });
  }
}
