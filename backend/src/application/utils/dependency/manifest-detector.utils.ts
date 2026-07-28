import { DependencyEcosystem } from '../../../domain/enums/dependency.enums.js';

/**
 * Manifest file patterns for each ecosystem
 */
const MANIFEST_PATTERNS: Record<DependencyEcosystem, string[]> = {
  [DependencyEcosystem.Npm]: ['package.json'],
  [DependencyEcosystem.Pip]: ['requirements.txt', 'pyproject.toml'],
  [DependencyEcosystem.Composer]: ['composer.json'],
  [DependencyEcosystem.Maven]: ['pom.xml'],
  [DependencyEcosystem.Cargo]: ['Cargo.toml'],
  [DependencyEcosystem.Gradle]: ['build.gradle', 'build.gradle.kts'],
  [DependencyEcosystem.Go]: ['go.mod'],
  [DependencyEcosystem.Nuget]: ['packages.config', '*.csproj'],
  [DependencyEcosystem.RubyGems]: ['Gemfile'],
};

/**
 * Detects ecosystem based on manifest file name
 * @param fileName - Name of the manifest file
 * @returns Detected ecosystem or null if not recognized
 */
export function detectEcosystemFromManifest(fileName: string): DependencyEcosystem | null {
  for (const [ecosystem, patterns] of Object.entries(MANIFEST_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern === '*') continue;
      if (pattern.includes('*')) {
        // Handle wildcard patterns (e.g., *.csproj)
        const regex = new RegExp(pattern.replace('*', '.*'));
        if (regex.test(fileName)) {
          return ecosystem as DependencyEcosystem;
        }
      } else if (fileName === pattern) {
        return ecosystem as DependencyEcosystem;
      }
    }
  }
  return null;
}

/**
 * Gets all manifest file names for a given ecosystem
 * @param ecosystem - The ecosystem to get manifest files for
 * @returns Array of manifest file patterns
 */
export function getManifestFilesForEcosystem(ecosystem: DependencyEcosystem): string[] {
  return MANIFEST_PATTERNS[ecosystem] || [];
}

/**
 * Gets priority order for manifest files to check
 * Returns most common manifests first
 */
export function getManifestFilePriority(): string[] {
  return [
    'package.json',
    'composer.json',
    'Cargo.toml',
    'pom.xml',
    'requirements.txt',
    'pyproject.toml',
    'go.mod',
    'Gemfile',
    'build.gradle',
    'build.gradle.kts',
  ];
}
