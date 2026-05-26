import type { WebhookSubscription, WebhookTriggersResponse } from './models/webhook-subscription';
import { request } from './request';

export function fetchWebhookTriggers(): Promise<WebhookTriggersResponse> {
  return request<WebhookTriggersResponse>('/api/webhook-subscriptions/triggers');
}

export function fetchWebhookSubscriptions(workspaceSlug: string): Promise<WebhookSubscription[]> {
  const search = new URLSearchParams({ workspaceSlug });
  return request<WebhookSubscription[]>(`/api/webhook-subscriptions?${search.toString()}`);
}

export function createWebhookSubscription(input: {
  workspaceSlug: string;
  label: string;
  url: string;
  secret?: string;
  events: string[];
}): Promise<WebhookSubscription> {
  return request<WebhookSubscription>('/api/webhook-subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateWebhookSubscription(
  id: string,
  input: { label?: string; url?: string; secret?: string; events?: string[]; enabled?: boolean },
): Promise<WebhookSubscription> {
  return request<WebhookSubscription>(`/api/webhook-subscriptions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteWebhookSubscription(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/webhook-subscriptions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
