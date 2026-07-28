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

/**
 * Common directories to ignore during recursive search
 */
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'target',
  'bin',
  'obj',
  'vendor',
  'coverage',
  '.vscode',
  '.idea',
  '__pycache__',
  '.pytest_cache',
]);

/**
 * Maximum depth for recursive manifest search
 */
const MAX_SEARCH_DEPTH = 3;

/**
 * Maximum number of manifest files to search per repository
 */
const MAX_MANIFESTS_PER_REPO = 50;

/**
 * Generates all possible manifest file paths to search recursively
 * @param manifestFiles - Manifest file names to search for
 * @param maxDepth - Maximum directory depth to search (default: 3)
 * @param maxPaths - Maximum number of paths to generate (default: 50)
 * @returns Array of possible file paths to check
 */
export function generateManifestSearchPaths(manifestFiles: string[], maxDepth: number = MAX_SEARCH_DEPTH, maxPaths: number = MAX_MANIFESTS_PER_REPO): string[] {
  const paths: string[] = [];
  
  // Add root level manifests (highest priority)
  for (const manifest of manifestFiles) {
    paths.push(manifest);
  }
  
  // Generate recursive paths up to maxDepth
  const commonDirs = ['backend', 'frontend', 'server', 'client', 'api', 'web', 'app', 'src', 'lib', 'services'];
  
  for (const dir of commonDirs) {
    for (const manifest of manifestFiles) {
      if (paths.length >= maxPaths) return paths;
      paths.push(`${dir}/${manifest}`);
      
      // Add one more level deep for common subdirectories
      const subDirs = ['src', 'lib', 'app', 'components', 'pages', 'api'];
      for (const subDir of subDirs) {
        if (paths.length >= maxPaths) return paths;
        paths.push(`${dir}/${subDir}/${manifest}`);
      }
    }
  }
  
  return paths;
}

/**
 * Checks if a directory should be ignored during search
 */
export function shouldIgnoreDirectory(dirName: string): boolean {
  return IGNORED_DIRECTORIES.has(dirName) || dirName.startsWith('.');
}
