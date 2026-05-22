import { request, type AuthUser } from './request';

const apiBasePath = (import.meta.env.VITE_KB_API_BASE_PATH || '').replace(/\/$/, '');

function resolveApiPath(path: string) {
  if (!apiBasePath || !path.startsWith('/api')) return path;
  return `${apiBasePath}${path.slice('/api'.length) || '/'}`;
}

export function login(params: { email: string; password: string }) {
  return request<{ ok: true; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function signup(params: { name: string; email: string; password: string }) {
  return request<{ ok: true; user: AuthUser }>('/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export function logout() {
  return request<{ ok: true }>('/api/auth/logout', { method: 'POST' });
}

export function fetchCurrentUser() {
  return request<{ ok: true; user: AuthUser }>('/api/auth/me');
}

export function buildGoogleAuthStartUrl(returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `${resolveApiPath('/api/auth/google/start')}?${params.toString()}`;
}
