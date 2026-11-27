import { RegistryStrategy, type RegistryVersionInfo } from './registry-strategy.interface.js';
import {
  RegistryInvalidPackageFormatException,
  RegistryPackageNotFoundException,
} from '../../../domain/exceptions/index.js';
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

    return this.withRegistryErrorHandling('Maven Central', packageName, async () => {
      const [groupId, artifactId] = packageName.split(':');
      
      if (!groupId || !artifactId) {
        throw new RegistryInvalidPackageFormatException('Invalid Maven package format. Expected groupId:artifactId');
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
        throw new RegistryPackageNotFoundException('Maven Central', packageName);
      }

      let latestDoc = docs[0];
      
      if (shouldFilterStable && isMavenPrerelease(latestDoc.v)) {
        latestDoc = docs.find((doc) => !isMavenPrerelease(doc.v)) ?? docs[0];
      }
      
      if (!latestDoc.v) {
        throw new RegistryPackageNotFoundException('Maven Central', packageName);
      }
      
      return {
        version: latestDoc.v,
        repositoryUrl: this.extractRepositoryUrl(latestDoc.p),
        changelog: latestDoc.p || '',
      };
    });
  }

  private extractRepositoryUrl(projectUrl?: string): string {
    if (projectUrl && isTrustedRepositoryUrl(projectUrl)) {
      return projectUrl;
    }
    return '';
  }
}
