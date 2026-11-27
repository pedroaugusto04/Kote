import { RegistryStrategy, type RegistryVersionInfo } from './registry-strategy.interface.js';
import { RegistryPackageNotFoundException } from '../../../domain/exceptions/index.js';

export class CargoRegistryStrategy extends RegistryStrategy {
  ecosystem = 'cargo';
  private readonly TIMEOUT_MS = 10000;

  constructor(private readonly stableOnly: boolean = true) {
    super();
  }

  async fetchLatestVersion(packageName: string, stableOnly?: boolean): Promise<RegistryVersionInfo> {
    const shouldFilterStable = stableOnly !== undefined ? stableOnly : this.stableOnly;

    return this.withRegistryErrorHandling('crates.io', packageName, async () => {
      const data = await this.fetchRegistryJson<{ crate?: { max_stable_version?: string; max_version?: string; repository?: string; description?: string } }>(
        `https://crates.io/api/v1/crates/${encodeURIComponent(packageName)}`,
        {
          registryName: 'crates.io',
          packageName,
          timeoutMs: this.TIMEOUT_MS,
        },
      );

      const crate = data.crate;
      const latestVersion = crate
        ? (shouldFilterStable ? (crate.max_stable_version || crate.max_version) : crate.max_version)
        : undefined;
      
      if (!latestVersion) {
        throw new RegistryPackageNotFoundException('crates.io', packageName);
      }

      return {
        version: latestVersion,
        repositoryUrl: crate?.repository || '',
        changelog: crate?.description || '',
      };
    });
  }
}
