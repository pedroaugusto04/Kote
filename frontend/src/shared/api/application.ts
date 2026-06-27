import { request } from './request';
import { API_PATHS } from './api-paths.constants';

export function logApplicationAccess() {
  return request<{ ok: true }>(API_PATHS.APPLICATION_ACCESS, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ page: 'landing' }),
  });
}
