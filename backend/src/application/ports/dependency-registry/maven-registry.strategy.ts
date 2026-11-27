import { RegistryStrategy, type RegistryVersionInfo } from './registry-strategy.interface.js';
import { isMavenPrerelease } from '../../utils/dependency/version.utils.js';
import { isTrustedRepositoryUrl } from '../../utils/dependency/repository-url.utils.js';

export class MavenRegistryStrategy extends RegistryStrategy {
  ecosystem = 'maven';
  private readonly TIMEOUT_MS = 30000;

  constructor(private readonly stableOnly: boolean = true) {
    super();
  }

  async fetchLatestVersion(packageName: string, stableOnly?: boolean): Promise<RegistryVersionInfo> {
    const shouldFilterStable = stableOnly !== undefined ? stableOnly : this.stableOnly;

    try {
      const [groupId, artifactId] = packageName.split(':');
      
      if (!groupId || !artifactId) {
        throw new Error('Invalid Maven package format. Expected groupId:artifactId');
      }

      // Fetch more results to filter for stable versions if needed
      const rows = shouldFilterStable ? 50 : 1;
      const data = await this.fetchRegistryJson<{ response?: { docs?: Array<{ v: string; p?: string }> } }>(
        `https://search.maven.org/solrsearch/select?q=g:${encodeURIComponent(groupId)}+AND+a:${encodeURIComponent(artifactId)}&rows=${rows}&wt=json`,
        {
          registryName: 'Maven Central',
          packageName,
          timeoutMs: this.TIMEOUT_MS,
        },
      );

      const docs = data.response?.docs;
      
      if (!docs || docs.length === 0) {
        throw new Error(`Package ${packageName} not found in Maven Central`);
      }

      let latestDoc = docs[0];
      
      if (shouldFilterStable && isMavenPrerelease(latestDoc.v)) {
        latestDoc = docs.find((doc) => !isMavenPrerelease(doc.v)) ?? docs[0];
      }
      
      if (!latestDoc.v) {
        throw new Error(`Version not found for package ${packageName}`);
      }
      
      return {
        version: latestDoc.v,
        repositoryUrl: this.extractRepositoryUrl(latestDoc.p),
        changelog: latestDoc.p || '',
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Maven Central request timeout')) {
        throw error;
      }
      throw new Error(`Maven registry fetch failed for ${packageName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private extractRepositoryUrl(projectUrl?: string): string {
    if (projectUrl && isTrustedRepositoryUrl(projectUrl)) {
      return projectUrl;
    }
    return '';
  }
}
