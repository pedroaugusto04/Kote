import { request, type AuthUser } from './request';
import { resolveApiPath } from './api-path';

function normalizeAuthUser(user: AuthUser): AuthUser {
  return {
    ...user,
    avatarUrl: user.avatarUrl ? resolveApiPath(user.avatarUrl) : null,
  };
}

function normalizeAuthResponse(response: { ok: true; user: AuthUser }) {
  return {
    ...response,
    user: normalizeAuthUser(response.user),
  };
}

export async function login(params: { email: string; password: string }) {
  return normalizeAuthResponse(await request<{ ok: true; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  }));
}

export async function signup(params: { name: string; email: string; password: string }) {
  return normalizeAuthResponse(await request<{ ok: true; user: AuthUser }>('/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  }));
}

export function logout() {
  return request<{ ok: true }>('/api/auth/logout', { method: 'POST' });
}

export async function fetchCurrentUser() {
  return normalizeAuthResponse(await request<{ ok: true; user: AuthUser }>('/api/auth/me'));
}

export async function uploadCurrentUserAvatar(file: File) {
  const body = new FormData();
  body.append('file', file);
  return normalizeAuthResponse(await request<{ ok: true; user: AuthUser }>('/api/auth/avatar', {
    method: 'PUT',
    body,
  }));
}

export async function deleteCurrentUserAvatar() {
  return normalizeAuthResponse(await request<{ ok: true; user: AuthUser }>('/api/auth/avatar', { method: 'DELETE' }));
}

export function buildGoogleAuthStartUrl(returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `${resolveApiPath('/api/auth/google/start')}?${params.toString()}`;
}
