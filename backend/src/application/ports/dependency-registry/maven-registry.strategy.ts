import { RegistryStrategy, type RegistryVersionInfo } from './registry-strategy.interface.js';
import { isMavenPrerelease } from '../../utils/dependency/version.utils.js';

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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

      // Fetch more results to filter for stable versions if needed
      const rows = shouldFilterStable ? 50 : 1;
      const response = await fetch(
        `https://search.maven.org/solrsearch/select?q=g:${encodeURIComponent(groupId)}+AND+a:${encodeURIComponent(artifactId)}&rows=${rows}&wt=json`,
        {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Kote-DependencyWatcher/1.0',
          },
        }
      );

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch package info from Maven Central: ${response.status}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (error) {
        throw new Error(`Failed to parse Maven Central response for ${packageName}`);
      }

      const docs = data.response?.docs;
      
      if (!docs || docs.length === 0) {
        throw new Error(`Package ${packageName} not found in Maven Central`);
      }

      let latestDoc = docs[0];
      
      if (shouldFilterStable && isMavenPrerelease(latestDoc.v)) {
        // Find the latest stable version from the results
        const stableDoc = docs.find((doc: { v: string }) => !isMavenPrerelease(doc.v));
        if (stableDoc) {
          latestDoc = stableDoc;
        } else {
          // No stable version found, use the latest version as fallback
          latestDoc = docs[0];
        }
      }
      
      if (!latestDoc.v) {
        throw new Error(`Version not found for package ${packageName}`);
      }
      
      const latestVersion = latestDoc.v;
      const repositoryUrl = this.extractRepositoryUrl(latestDoc.p);
      const changelog = latestDoc.p || '';

      return {
        version: latestVersion,
        repositoryUrl,
        changelog,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Maven Central request timeout for ${packageName}`);
      }
      throw new Error(`Maven registry fetch failed for ${packageName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private extractRepositoryUrl(projectUrl?: string): string {
    if (projectUrl && (projectUrl.includes('github.com') || projectUrl.includes('gitlab.com'))) {
      return projectUrl;
    }
    return '';
  }
}
