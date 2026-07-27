import { request, type AuthUser } from './request';
import { resolveApiPath } from './api-path';
import { API_PATHS } from './api-paths.constants';

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
  return normalizeAuthResponse(await request<{ ok: true; user: AuthUser }>(API_PATHS.AUTH_LOGIN, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  }));
}

export async function signup(params: { name: string; email: string; password: string }) {
  return normalizeAuthResponse(await request<{ ok: true; user: AuthUser }>(API_PATHS.AUTH_SIGNUP, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  }));
}

export function logout() {
  return request<{ ok: true }>(API_PATHS.AUTH_LOGOUT, { method: 'POST' });
}

export async function fetchCurrentUser() {
  return normalizeAuthResponse(await request<{ ok: true; user: AuthUser }>(API_PATHS.AUTH_ME));
}

export async function uploadCurrentUserAvatar(file: File) {
  const body = new FormData();
  body.append('file', file);
  return normalizeAuthResponse(await request<{ ok: true; user: AuthUser }>(API_PATHS.AUTH_AVATAR, {
    method: 'PUT',
    body,
  }));
}

export async function deleteCurrentUserAvatar() {
  return normalizeAuthResponse(await request<{ ok: true; user: AuthUser }>(API_PATHS.AUTH_AVATAR, { method: 'DELETE' }));
}

export function buildGoogleAuthStartUrl(returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `${resolveApiPath(API_PATHS.AUTH_GOOGLE_START)}?${params.toString()}`;
}

export async function fetchConnectionToken() {
  return request<{ ok: true; connectionToken: string }>(API_PATHS.AUTH_CONNECTION_TOKEN);
}

export async function reportVscodeInstalled() {
  return request<{ ok: true }>(API_PATHS.AUTH_VSCODE_INSTALLED, { method: 'POST' });
}
