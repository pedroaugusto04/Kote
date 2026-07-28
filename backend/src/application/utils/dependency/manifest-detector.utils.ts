import { DependencyEcosystem } from '../../../domain/enums/dependency.enums.js';

const MANIFEST_PATTERNS: Record<DependencyEcosystem, string[]> = {
  [DependencyEcosystem.Npm]: ['package.json'],
  [DependencyEcosystem.Pip]: [
    'requirements.txt',
    'pyproject.toml',
  ],
  [DependencyEcosystem.Composer]: ['composer.json'],
  [DependencyEcosystem.Maven]: ['pom.xml'],
  [DependencyEcosystem.Cargo]: ['Cargo.toml'],
  [DependencyEcosystem.Gradle]: [
    'build.gradle',
    'build.gradle.kts',
  ],
  [DependencyEcosystem.Go]: ['go.mod'],
  [DependencyEcosystem.Nuget]: [
    'packages.config',
    '*.csproj',
  ],
  [DependencyEcosystem.RubyGems]: ['Gemfile'],
};

export const MAX_MANIFESTS_PER_REPO = 50;

/**
 * Detect ecosystem from manifest filename.
 */
export function detectEcosystemFromManifest(
  fileName: string,
): DependencyEcosystem | null {
  for (const [ecosystem, patterns] of Object.entries(
    MANIFEST_PATTERNS,
  )) {
    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        const regex = new RegExp(
          `^${pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')}$`,
        );

        if (regex.test(fileName)) {
          return ecosystem as DependencyEcosystem;
        }
      }

      if (fileName === pattern) {
        return ecosystem as DependencyEcosystem;
      }
    }
  }

  return null;
}

/**
 * Returns all manifest patterns.
 */
export function getAllManifestPatterns(): string[] {
  return Object.values(MANIFEST_PATTERNS).flat();
}