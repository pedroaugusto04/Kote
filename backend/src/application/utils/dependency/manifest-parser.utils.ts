import { DependencyEcosystem } from '../../../domain/enums/dependency.enums.js';

/**
 * Parsed dependency information
 */
export interface ParsedDependency {
  packageName: string;
  version: string;
}

/**
 * Parses manifest file content and extracts dependencies
 * @param fileName - Name of the manifest file
 * @param content - Content of the manifest file
 * @returns Array of parsed dependencies
 */
export function parseManifestDependencies(fileName: string, content: string): ParsedDependency[] {
  const ecosystem = detectEcosystemFromFileName(fileName);
  if (!ecosystem) {
    return [];
  }

  switch (ecosystem) {
    case DependencyEcosystem.Npm:
      return parsePackageJson(content);
    case DependencyEcosystem.Pip:
      if (fileName === 'requirements.txt') {
        return parseRequirementsTxt(content);
      } else if (fileName === 'pyproject.toml') {
        return parsePyprojectToml(content);
      }
      return [];
    case DependencyEcosystem.Composer:
      return parseComposerJson(content);
    case DependencyEcosystem.Maven:
      return parsePomXml(content);
    case DependencyEcosystem.Cargo:
      return parseCargoToml(content);
    case DependencyEcosystem.Go:
      return parseGoMod(content);
    case DependencyEcosystem.RubyGems:
      return parseGemfile(content);
    default:
      return [];
  }
}

/**
 * Detects ecosystem from file name
 */
function detectEcosystemFromFileName(fileName: string): DependencyEcosystem | null {
  const manifestMap: Record<string, DependencyEcosystem> = {
    'package.json': DependencyEcosystem.Npm,
    'requirements.txt': DependencyEcosystem.Pip,
    'pyproject.toml': DependencyEcosystem.Pip,
    'composer.json': DependencyEcosystem.Composer,
    'pom.xml': DependencyEcosystem.Maven,
    'Cargo.toml': DependencyEcosystem.Cargo,
    'go.mod': DependencyEcosystem.Go,
    'Gemfile': DependencyEcosystem.RubyGems,
    'build.gradle': DependencyEcosystem.Gradle,
    'build.gradle.kts': DependencyEcosystem.Gradle,
  };

  return manifestMap[fileName] || null;
}

/**
 * Parses package.json (npm)
 */
function parsePackageJson(content: string): ParsedDependency[] {
  try {
    const pkg = JSON.parse(content);
    const dependencies: ParsedDependency[] = [];

    for (const [name, version] of Object.entries(pkg.dependencies || {})) {
      dependencies.push({ packageName: name, version: version as string });
    }
    for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
      dependencies.push({ packageName: name, version: version as string });
    }

    return dependencies;
  } catch {
    return [];
  }
}

/**
 * Parses requirements.txt (pip)
 */
function parseRequirementsTxt(content: string): ParsedDependency[] {
  const dependencies: ParsedDependency[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) {
      continue;
    }

    // Parse: package==version, package>=version, package~=version, etc.
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)([><=~!]+.*)?$/);
    if (match) {
      dependencies.push({
        packageName: match[1],
        version: match[2] || '*',
      });
    }
  }

  return dependencies;
}

/**
 * Parses pyproject.toml (pip)
 */
function parsePyprojectToml(content: string): ParsedDependency[] {
  const dependencies: ParsedDependency[] = [];
  
  try {
    // Simple TOML parsing for dependencies section
    const lines = content.split('\n');
    let inDependencies = false;
    let inDevDependencies = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('dependencies = [')) {
        inDependencies = true;
        continue;
      }
      if (trimmed.startsWith('dev-dependencies = [')) {
        inDevDependencies = true;
        continue;
      }
      if (trimmed === ']') {
        inDependencies = false;
        inDevDependencies = false;
        continue;
      }

      if (inDependencies || inDevDependencies) {
        const match = trimmed.match(/^"([^"]+)"(?:[>=<~!]+([^"]+))?/);
        if (match) {
          dependencies.push({
            packageName: match[1],
            version: match[2] || '*',
          });
        }
      }
    }
  } catch {
    // Fallback to empty array on parse error
  }

  return dependencies;
}

/**
 * Parses composer.json (PHP)
 */
function parseComposerJson(content: string): ParsedDependency[] {
  try {
    const composer = JSON.parse(content);
    const dependencies: ParsedDependency[] = [];

    for (const [name, version] of Object.entries(composer.require || {})) {
      dependencies.push({ packageName: name, version: version as string });
    }
    for (const [name, version] of Object.entries(composer['require-dev'] || {})) {
      dependencies.push({ packageName: name, version: version as string });
    }

    return dependencies;
  } catch {
    return [];
  }
}

/**
 * Parses pom.xml (Maven)
 */
function parsePomXml(content: string): ParsedDependency[] {
  const dependencies: ParsedDependency[] = [];
  
  try {
    // Simple XML parsing for dependencies
    const dependencyRegex = /<dependency>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?<version>([^<]+)<\/version>[\s\S]*?<\/dependency>/g;
    let match;

    while ((match = dependencyRegex.exec(content)) !== null) {
      const groupId = match[1].trim();
      const artifactId = match[2].trim();
      const version = match[3].trim();
      
      dependencies.push({
        packageName: `${groupId}:${artifactId}`,
        version,
      });
    }
  } catch {
    // Fallback to empty array on parse error
  }

  return dependencies;
}

/**
 * Parses Cargo.toml (Rust)
 */
function parseCargoToml(content: string): ParsedDependency[] {
  const dependencies: ParsedDependency[] = [];
  
  try {
    const lines = content.split('\n');
    let inDependencies = false;
    let inDevDependencies = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === '[dependencies]') {
        inDependencies = true;
        continue;
      }
      if (trimmed === '[dev-dependencies]') {
        inDevDependencies = true;
        continue;
      }
      if (trimmed.startsWith('[') && trimmed !== '[dependencies]' && trimmed !== '[dev-dependencies]') {
        inDependencies = false;
        inDevDependencies = false;
        continue;
      }

      if ((inDependencies || inDevDependencies) && trimmed.includes('=')) {
        const [name, version] = trimmed.split('=').map(s => s.trim());
        // Remove quotes from version
        const cleanVersion = version.replace(/["']/g, '');
        dependencies.push({ packageName: name, version: cleanVersion });
      }
    }
  } catch {
    // Fallback to empty array on parse error
  }

  return dependencies;
}

/**
 * Parses go.mod (Go)
 */
function parseGoMod(content: string): ParsedDependency[] {
  const dependencies: ParsedDependency[] = [];
  
  try {
    const lines = content.split('\n');
    let inRequire = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === 'require (') {
        inRequire = true;
        continue;
      }
      if (trimmed === ')') {
        inRequire = false;
        continue;
      }

      if (inRequire && trimmed.startsWith('github.com/') || trimmed.startsWith('golang.org/')) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          dependencies.push({
            packageName: parts[0],
            version: parts[1],
          });
        }
      }
    }
  } catch {
    // Fallback to empty array on parse error
  }

  return dependencies;
}

/**
 * Parses Gemfile (Ruby)
 */
function parseGemfile(content: string): ParsedDependency[] {
  const dependencies: ParsedDependency[] = [];
  
  try {
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('gem ')) {
        // Parse: gem 'package', 'version' or gem 'package', '~> version'
        const match = trimmed.match(/gem ['"]([^'"]+)['"](?:,\s*['"]?([^'"]+)['"]?)?/);
        if (match) {
          dependencies.push({
            packageName: match[1],
            version: match[2] || '*',
          });
        }
      }
    }
  } catch {
    // Fallback to empty array on parse error
  }

  return dependencies;
}
