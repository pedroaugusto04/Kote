import { request, type AuthUser } from './request';

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
