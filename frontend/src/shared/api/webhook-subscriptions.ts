import type { WebhookSubscription, WebhookTriggersResponse } from './models/webhook-subscription';
import { request } from './request';
import { API_PATHS, buildApiPath, buildApiUrl } from './api-paths.constants';

export function fetchWebhookTriggers(): Promise<WebhookTriggersResponse> {
  return request<WebhookTriggersResponse>(API_PATHS.WEBHOOK_SUBSCRIPTIONS_TRIGGERS);
}

export function fetchWebhookSubscriptions(workspaceSlug: string): Promise<WebhookSubscription[]> {
  return request<WebhookSubscription[]>(buildApiUrl(API_PATHS.WEBHOOK_SUBSCRIPTIONS, { workspaceSlug }));
}

export function createWebhookSubscription(input: {
  workspaceSlug: string;
  label: string;
  url: string;
  secret?: string;
  events: string[];
}): Promise<WebhookSubscription> {
  return request<WebhookSubscription>(API_PATHS.WEBHOOK_SUBSCRIPTIONS, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateWebhookSubscription(
  id: string,
  input: { label?: string; url?: string; secret?: string; events?: string[]; enabled?: boolean },
): Promise<WebhookSubscription> {
  return request<WebhookSubscription>(buildApiPath(API_PATHS.WEBHOOK_SUBSCRIPTION_DETAIL, { id }), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteWebhookSubscription(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(buildApiPath(API_PATHS.WEBHOOK_SUBSCRIPTION_DETAIL, { id }), {
    method: 'DELETE',
  });
}
