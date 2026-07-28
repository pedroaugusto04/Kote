import { RegistryStrategy, type RegistryVersionInfo } from './registry-strategy.interface.js';
import { extractRepositoryUrl } from '../../utils/dependency/repository-url.utils.js';

export class PipRegistryStrategy extends RegistryStrategy {
  ecosystem = 'pip';
  private readonly TIMEOUT_MS = 10000;

  async fetchLatestVersion(packageName: string): Promise<RegistryVersionInfo> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      const response = await fetch(`https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Kote-DependencyWatcher/1.0',
        },
      });

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch package info from PyPI: ${response.status}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (error) {
        throw new Error(`Failed to parse PyPI response for ${packageName}`);
      }

      if (!data.info || !data.info.version) {
        throw new Error(`Invalid package data from PyPI for ${packageName}`);
      }

      const latestVersion = data.info.version;
      const repositoryUrl = extractRepositoryUrl(data.info.repository_url, data.info.home_page);

      return {
        version: latestVersion,
        repositoryUrl,
        changelog: data.info.summary || '',
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`PyPI request timeout for ${packageName}`);
      }
      throw new Error(`PyPI registry fetch failed for ${packageName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
