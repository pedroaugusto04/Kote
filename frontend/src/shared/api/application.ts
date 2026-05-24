import { request } from './request';

export function logApplicationAccess() {
  return request<{ ok: true }>('/api/application/access', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ page: 'landing' }),
  });
}
