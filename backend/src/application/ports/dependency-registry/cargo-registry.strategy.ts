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
      const data = await this.fetchRegistryJson<{ crate?: { max_stable_version?: string; max_version?: string; repository?: string; description?: string } }>(
        `https://crates.io/api/v1/crates/${encodeURIComponent(packageName)}`,
        {
          registryName: 'crates.io',
          packageName,
          timeoutMs: this.TIMEOUT_MS,
        },
      );

      const crate = data.crate;
      
      if (!crate) {
        throw new Error(`Package ${packageName} not found in crates.io`);
      }

      const latestVersion = shouldFilterStable
        ? (crate.max_stable_version || crate.max_version)
        : crate.max_version;
      
      if (!latestVersion) {
        throw new Error(`Version not found for package ${packageName}`);
      }

      return {
        version: latestVersion,
        repositoryUrl: crate.repository || '',
        changelog: crate.description || '',
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('crates.io request timeout')) {
        throw error;
      }
      throw new Error(`Cargo registry fetch failed for ${packageName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
