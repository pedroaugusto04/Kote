function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeFrontendBasePath(value: string | undefined): string {
  const normalized = trimTrailingSlash((value || '').trim());
  if (!normalized || normalized === '/') return '/';
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

export const frontendBasePath = normalizeFrontendBasePath(import.meta.env.VITE_KB_FRONTEND_BASE_PATH);
 
export function withFrontendBasePath(path: string): string {
  if (!path.startsWith('/')) return path;
  if (frontendBasePath === '/' || path === frontendBasePath || path.startsWith(`${frontendBasePath}/`)) return path;
  return `${frontendBasePath}${path}`;
}
