import { RegistryStrategy, type RegistryVersionInfo } from './registry-strategy.interface.js';

export class CargoRegistryStrategy extends RegistryStrategy {
  ecosystem = 'cargo';
  private readonly TIMEOUT_MS = 10000;

  constructor(private readonly stableOnly: boolean = true) {
    super();
  }

  async fetchLatestVersion(packageName: string, stableOnly?: boolean): Promise<RegistryVersionInfo> {
    const shouldFilterStable = stableOnly !== undefined ? stableOnly : this.stableOnly;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      const response = await fetch(`https://crates.io/api/v1/crates/${encodeURIComponent(packageName)}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Kote-DependencyWatcher/1.0',
        },
      });

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch package info from crates.io: ${response.status}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (error) {
        throw new Error(`Failed to parse crates.io response for ${packageName}`);
      }

      const crate = data.crate;
      
      if (!crate) {
        throw new Error(`Package ${packageName} not found in crates.io`);
      }

      let latestVersion: string;
      if (shouldFilterStable) {
        latestVersion = crate.max_stable_version || crate.max_version;
      } else {
        latestVersion = crate.max_version;
      }
      
      if (!latestVersion) {
        throw new Error(`Version not found for package ${packageName}`);
      }

      const repositoryUrl = crate.repository || '';
      const changelog = crate.description || '';

      return {
        version: latestVersion,
        repositoryUrl,
        changelog,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`crates.io request timeout for ${packageName}`);
      }
      throw new Error(`Cargo registry fetch failed for ${packageName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
