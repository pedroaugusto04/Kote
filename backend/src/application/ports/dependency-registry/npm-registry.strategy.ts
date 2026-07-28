import { RegistryStrategy, type RegistryVersionInfo } from './registry-strategy.interface.js';
import { extractRepositoryUrl } from '../../utils/dependency/repository-url.utils.js';

export class NpmRegistryStrategy extends RegistryStrategy {
  ecosystem = 'npm';
  private readonly TIMEOUT_MS = 10000;

  async fetchLatestVersion(packageName: string): Promise<RegistryVersionInfo> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
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

      return {
        version: data.version,
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
}
