import { RegistryStrategy, type RegistryVersionInfo } from './registry-strategy.interface.js';
import { compare, coerce, valid, prerelease } from 'semver';
import { extractRepositoryUrl } from '../../utils/dependency/repository-url.utils.js';

export class ComposerRegistryStrategy extends RegistryStrategy {
  ecosystem = 'composer';
  private readonly TIMEOUT_MS = 10000;

  async fetchLatestVersion(packageName: string): Promise<RegistryVersionInfo> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      const response = await fetch(`https://repo.packagist.org/p2/${encodeURIComponent(packageName)}.json`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Kote-DependencyWatcher/1.0',
        },
      });

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch package info from Packagist: ${response.status}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (error) {
        throw new Error(`Failed to parse Packagist response for ${packageName}`);
      }

      const packageVersions = data.packages[packageName];
      
      if (!packageVersions || Object.keys(packageVersions).length === 0) {
        throw new Error(`Package ${packageName} not found in Packagist`);
      }

      const versions = Object.keys(packageVersions);
      const stableVersions = versions.filter(v => this.isStableVersion(v));
      
      if (stableVersions.length === 0) {
        throw new Error(`No stable versions found for package ${packageName}`);
      }

      const sortedVersions = stableVersions.sort((a, b) => {
        const coercedA = coerce(a);
        const coercedB = coerce(b);
        if (!coercedA || !coercedB) return 0;
        return compare(coercedA, coercedB);
      });
      
      const latestVersion = sortedVersions[sortedVersions.length - 1];
      const packageData = packageVersions[latestVersion];
      
      if (!packageData) {
        throw new Error(`Version data not found for ${packageName}@${latestVersion}`);
      }
      
      const repositoryUrl = extractRepositoryUrl(packageData.source?.url, packageData.homepage);
      const changelog = packageData.description || '';

      return {
        version: latestVersion,
        repositoryUrl,
        changelog,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Packagist request timeout for ${packageName}`);
      }
      throw new Error(`Composer registry fetch failed for ${packageName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private isStableVersion(version: string): boolean {
    const coerced = coerce(version);
    if (!coerced) return false;
    return valid(version) !== null && prerelease(version) === null;
  }
}
