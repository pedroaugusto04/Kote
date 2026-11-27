import {
  AppException,
  RegistryFetchException,
  RegistryTimeoutException,
} from '../../../domain/exceptions/index.js';

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
}

export abstract class RegistryStrategy {
  abstract ecosystem: string;
  abstract fetchLatestVersion(packageName: string, stableOnly?: boolean): Promise<RegistryVersionInfo>;

  protected async withRegistryErrorHandling(
    registryName: string,
    packageName: string,
    task: () => Promise<RegistryVersionInfo>,
  ): Promise<RegistryVersionInfo> {
    try {
      return await task();
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : String(error);
      throw new RegistryFetchException(registryName, packageName, detail, { cause: error });
    }
  }

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
          : `HTTP ${response.status}`;
        throw new RegistryFetchException(options.registryName, options.packageName, message, { status: response.status });
      }

      try {
        return await response.json() as T;
      } catch (parseError) {
        throw new RegistryFetchException(options.registryName, options.packageName, 'invalid JSON response', { cause: parseError });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new RegistryTimeoutException(options.registryName, options.packageName, error);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
