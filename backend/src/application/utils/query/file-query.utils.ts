const GENERIC_FILE_NAMES = new Set([
  'index', 'utils', 'types', 'constants', 'helpers', 'main',
  'app', 'config', 'common', 'shared', 'base', 'abstract',
  'middleware', 'module', 'spec', 'test', 'mock', 'fixture',
]);

export function filePathToQuery(filePath: string): string {
  const fileName = filePath.split('/').pop() ?? filePath;
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  // camelCase / PascalCase → tokens, separators → space
  const tokens = withoutExt
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .toLowerCase()
    .trim();
  return tokens;
}

export function isGenericFile(filePath: string): boolean {
  const fileName = filePath.split('/').pop() ?? '';
  const base = fileName.replace(/\.[^.]+$/, '').toLowerCase();
  // Single-word generic names
  if (GENERIC_FILE_NAMES.has(base)) return true;
  // Very short names (e.g. 'ui', 'db', 'io')
  if (base.length <= 2) return true;
  return false;
}
