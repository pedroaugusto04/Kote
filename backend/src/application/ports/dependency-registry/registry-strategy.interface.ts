export type RegistryVersionInfo = {
  version: string;
  changelog?: string;
  releaseNotes?: string;
  repositoryUrl?: string;
};

export abstract class RegistryStrategy {
  abstract ecosystem: string;
  abstract fetchLatestVersion(packageName: string, stableOnly?: boolean): Promise<RegistryVersionInfo>;
}
