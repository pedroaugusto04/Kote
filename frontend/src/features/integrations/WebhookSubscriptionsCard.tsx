import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  fetchWebhookSubscriptions,
  fetchWebhookTriggers,
} from '../../shared/api/client';
import type { WebhookSubscription } from '../../shared/api/models/webhook-subscription';
import { WEBHOOK_MESSAGES } from './webhook.constants';
import { Badge, EmptyState, InlineMessage, Panel } from '../../shared/ui/primitives';
import { WebhookFormModal } from './WebhookFormModal';
import { SubscriptionRow } from './SubscriptionRow';

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------
export function WebhookSubscriptionsCard({ workspaceSlug }: { workspaceSlug: string }) {
  const [showForm, setShowForm] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<WebhookSubscription | null>(null);

  const triggersQuery = useQuery({
    queryKey: ['webhook-triggers'],
    queryFn: fetchWebhookTriggers,
    staleTime: Infinity,
  });
  const subscriptionsQuery = useQuery({
    queryKey: ['webhook-subscriptions', workspaceSlug],
    queryFn: () => fetchWebhookSubscriptions(workspaceSlug),
    enabled: Boolean(workspaceSlug),
  });

  const triggers = triggersQuery.data?.triggers ?? [];
  const subscriptions = subscriptionsQuery.data ?? [];

  const openCreate = () => { setEditingSubscription(null); setShowForm(true); };
  const openEdit = (sub: WebhookSubscription) => { setEditingSubscription(sub); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditingSubscription(null); };

  return (
    <>
      <Panel className="integration-card webhook-card">
        <div className="integration-card-head">
          <div className="integration-logo-fallback">{WEBHOOK_MESSAGES.CARD.LOGO_FALLBACK}</div>
          <div>
            <h2>{WEBHOOK_MESSAGES.CARD.TITLE}</h2>
            <p>{WEBHOOK_MESSAGES.CARD.DESCRIPTION}</p>
          </div>
        </div>

        <div className="integration-card-body">
          {subscriptionsQuery.isLoading ? <p className="meta">{WEBHOOK_MESSAGES.CARD.LOADING}</p> : null}
          {subscriptionsQuery.isError ? <InlineMessage tone="error">{WEBHOOK_MESSAGES.CARD.ERROR}</InlineMessage> : null}
          {!subscriptionsQuery.isLoading && subscriptions.length === 0 ? (
            <EmptyState>{WEBHOOK_MESSAGES.CARD.EMPTY}</EmptyState>
          ) : null}
          {subscriptions.map((sub) => (
            <SubscriptionRow
              key={sub.id}
              subscription={sub}
              workspaceSlug={workspaceSlug}
              onEdit={() => openEdit(sub)}
            />
          ))}
        </div>

        <div className="integration-card-foot">
          <Badge value={WEBHOOK_MESSAGES.CARD.COUNT.replace('{count}', String(subscriptions.length)).replace('{plural}', subscriptions.length === 1 ? '' : 's')} tone="low" />
          <div className="integration-actions">
            <button className="icon-button" type="button" onClick={openCreate}>{WEBHOOK_MESSAGES.CARD.NEW_BUTTON}</button>
          </div>
        </div>
      </Panel>

      {showForm ? (
        <WebhookFormModal
          workspaceSlug={workspaceSlug}
          triggers={triggers}
          editing={editingSubscription}
          onClose={closeForm}
        />
      ) : null}
    </>
  );
}
