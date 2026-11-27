export type RegistryVersionInfo = {
  version: string;
  changelog?: string;
  releaseNotes?: string;
  repositoryUrl?: string;
};

export interface RegistryFetchOptions {
  registryName: string;
  packageName: string;
  timeoutMs: number;
  buildStatusError?: (response: Response) => string;
  buildParseError?: () => string;
}

export abstract class RegistryStrategy {
  abstract ecosystem: string;
  abstract fetchLatestVersion(packageName: string, stableOnly?: boolean): Promise<RegistryVersionInfo>;

  protected async fetchRegistryJson<T>(url: string, options: RegistryFetchOptions): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);
    timeoutId.unref?.();

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Kote-DependencyWatcher/1.0',
        },
      });

      if (!response.ok) {
        const message = options.buildStatusError
          ? options.buildStatusError(response)
          : `Failed to fetch package info from ${options.registryName}: ${response.status}`;
        throw new Error(message);
      }

      try {
        return await response.json() as T;
      } catch {
        throw new Error(
          options.buildParseError
            ? options.buildParseError()
            : `Failed to parse ${options.registryName} response for ${options.packageName}`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`${options.registryName} request timeout for ${options.packageName}`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
