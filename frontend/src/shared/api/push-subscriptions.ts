import { request } from './request';

export function fetchPushPublicKey(): Promise<{ publicKey: string }> {
  return request<{ publicKey: string }>('/api/push-subscriptions/public-key');
}

export function subscribePush(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<{ id: string; userId: string; endpoint: string }> {
  return request<{ id: string; userId: string; endpoint: string }>('/api/push-subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(subscription),
  });
}

export function unsubscribePush(endpoint: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/push-subscriptions', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}
