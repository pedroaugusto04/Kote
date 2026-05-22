export function resolveApiPath(path: string, configuredBasePath = import.meta.env.VITE_KB_API_BASE_PATH || '') {
  const apiBasePath = configuredBasePath.replace(/\/$/, '');
  if (!apiBasePath || !path.startsWith('/api')) return path;
  return `${apiBasePath}${path.slice('/api'.length) || '/'}`;
}
