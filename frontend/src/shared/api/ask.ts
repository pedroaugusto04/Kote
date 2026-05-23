import type { AskResponse } from './models/ask';
import { request } from './request';

export function runAsk(params: { question: string }) {
  return request<AskResponse>('/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
}
