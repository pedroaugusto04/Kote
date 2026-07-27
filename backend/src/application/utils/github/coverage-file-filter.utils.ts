const COVERAGE_FILE_EXTENSIONS = new Set([
  'astro', 'c', 'cc', 'clj', 'cljs', 'cpp', 'cs', 'css', 'cxx', 'dart', 'ex', 'exs', 'fs', 'fsx',
  'go', 'graphql', 'gql', 'groovy', 'h', 'hh', 'hpp', 'hrl', 'hs', 'html', 'hxx', 'java', 'js',
  'json', 'jsx', 'kt', 'kts', 'less', 'lua', 'm', 'mjs', 'mm', 'mts', 'php', 'pl', 'pm', 'proto',
  'ps1', 'py', 'pyi', 'r', 'rb', 'rs', 's', 'sass', 'scala', 'scss', 'sh', 'sql', 'svelte', 'swift',
  'tf', 'tfvars', 'toml', 'ts', 'tsx', 'vb', 'vue', 'xml', 'yaml', 'yml', 'zsh',
]);

const COVERAGE_FILE_NAMES = new Set([
  '.babelrc', '.editorconfig', '.eslintrc', '.gitattributes', '.gitignore', '.npmrc', '.nvmrc',
  '.prettierignore', '.prettierrc', '.python-version', '.ruby-version', '.stylelintrc', '.tool-versions',
  'cmakelists.txt', 'containerfile', 'dockerfile', 'gemfile', 'justfile', 'makefile', 'procfile',
  'rakefile', 'vagrantfile',
]);

const GENERATED_OR_VENDOR_DIRECTORIES = new Set([
  '.cache', '.git', '.next', '.nuxt', '.turbo', '.venv', '__pycache__', 'bin', 'build', 'coverage',
  'dist', 'node_modules', 'obj', 'out', 'target', 'vendor', 'venv',
]);

function getFileName(filePath: string): string {
  const pathParts = filePath.replaceAll('\\', '/').split('/');
  return pathParts[pathParts.length - 1].toLowerCase();
}

function hasGeneratedOrVendorDirectory(filePath: string): boolean {
  return filePath
    .replaceAll('\\', '/')
    .split('/')
    .slice(0, -1)
    .some((directory) => GENERATED_OR_VENDOR_DIRECTORIES.has(directory.toLowerCase()));
}

/**
 * Returns true only for source/configuration files that can reasonably have
 * engineering knowledge attached to them. Unknown extensions are excluded by
 * default so documentation, media and binary blobs cannot inflate coverage.
 */
export function isEligibleFileForCoverage(filePath: string): boolean {
  const trimmedPath = filePath.trim();
  if (!trimmedPath || hasGeneratedOrVendorDirectory(trimmedPath)) return false;

  const fileName = getFileName(trimmedPath);
  if (COVERAGE_FILE_NAMES.has(fileName)) return true;

  const extension = fileName.includes('.') ? fileName.split('.').pop() || '' : '';
  return COVERAGE_FILE_EXTENSIONS.has(extension);
}

// Kept as a compatibility helper for existing callers.
export function isIgnoredFileForCoverage(filePath: string): boolean {
  return !isEligibleFileForCoverage(filePath);
}

export function normalizeCoveragePath(filePath: string): string {
  return filePath
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .toLowerCase();
}
