import { request } from './request';
import { API_PATHS } from './api-paths.constants';

export function fetchPushPublicKey(): Promise<{ publicKey: string }> {
  return request<{ publicKey: string }>(API_PATHS.PUSH_SUBSCRIPTIONS_PUBLIC_KEY);
}

export function subscribePush(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<{ id: string; userId: string; endpoint: string }> {
  return request<{ id: string; userId: string; endpoint: string }>(API_PATHS.PUSH_SUBSCRIPTIONS, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(subscription),
  });
}

export function unsubscribePush(endpoint: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(API_PATHS.PUSH_SUBSCRIPTIONS, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}
