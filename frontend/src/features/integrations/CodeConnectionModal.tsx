import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { formatDisplayToken } from '../../shared/utils/format';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';
import {
  INTEGRATION_MESSAGES,
  INTEGRATION_STATUS_TONE,
  IntegrationProvider,
} from './integrations.constants';
import { fetchIntegrationSession } from '../../shared/api/client';
import type { IntegrationConnectionResponse } from '../../shared/api/models/integration';
import { Badge, InlineMessage } from '../../shared/ui/primitives';
import { StoredIntegrationStatus } from '../../shared/api/enums';

const WHATSAPP_NUMBER = INTEGRATION_MESSAGES.WHATSAPP_NUMBER;
const TELEGRAM_BOT_USERNAME = INTEGRATION_MESSAGES.TELEGRAM_BOT_USERNAME;

function buildChatComposeUrl(connection: IntegrationConnectionResponse): string {
  const text = (connection.instruction || '').trim();
  if (!text) return '';
  const encoded = encodeURIComponent(text);
  if (connection.provider === IntegrationProvider.Whatsapp) {
    return `${INTEGRATION_MESSAGES.WHATSAPP_BASE_URL}${WHATSAPP_NUMBER}?text=${encoded}`;
  }
  if (connection.provider === IntegrationProvider.Telegram) {
    return `${INTEGRATION_MESSAGES.TELEGRAM_BASE_URL}${TELEGRAM_BOT_USERNAME}`;
  }
  return '';
}

export interface CodeConnectionModalProps {
  connection: IntegrationConnectionResponse;
  onClose: () => void;
  workspaceSlug: string;
}

export function CodeConnectionModal({ connection, onClose, workspaceSlug }: CodeConnectionModalProps) {
  const queryClient = useQueryClient();
  const session = connection.session;
  const composeUrl = buildChatComposeUrl(connection);
  const sessionQuery = useQuery({
    queryKey: ['integration-session', workspaceSlug, connection.provider, session?.id],
    queryFn: () => fetchIntegrationSession({ provider: connection.provider, sessionId: session?.id || '' }),
    enabled: session?.status === StoredIntegrationStatus.Pending,
    refetchInterval: (query) => query.state.data?.session.status === StoredIntegrationStatus.Pending ? 2500 : false,
  });
  const currentSession = sessionQuery.data?.session || session;
  const providerLabel = connection.provider === IntegrationProvider.Telegram
    ? INTEGRATION_MESSAGES.PROVIDER_LABELS[IntegrationProvider.Telegram]
    : INTEGRATION_MESSAGES.PROVIDER_LABELS[IntegrationProvider.Whatsapp];

  useEffect(() => {
    if (currentSession?.status === StoredIntegrationStatus.Connected) {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  }, [currentSession?.status, queryClient, workspaceSlug]);

  const isWhatsApp = connection.provider === IntegrationProvider.Whatsapp;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section aria-labelledby="connection-title" aria-modal="true" className="modal-panel integration-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="card-kicker">{connection.provider}</div>
            <div className="integration-modal-title">
              <h2 id="connection-title">{INTEGRATION_MESSAGES.CONNECTION.TITLE.replace('{provider}', providerLabel)}</h2>
              {currentSession ? <Badge value={formatDisplayToken(currentSession.status)} tone={INTEGRATION_STATUS_TONE[currentSession.status] || 'medium'} /> : null}
            </div>
          </div>
          <button aria-label={UI_MESSAGES.CLOSE_DETAILS} className="modal-close" type="button" onClick={onClose}>x</button>
        </div>

        {isWhatsApp ? (
          <>
            <p className="meta" style={{ marginBottom: '8px' }}>{INTEGRATION_MESSAGES.CONNECTION.WHATSAPP_INSTRUCTION}</p>
            <div className="connection-code" aria-label="Connection code">{connection.verificationCode}</div>
            <p>
              {INTEGRATION_MESSAGES.CONNECTION.SEND_TO_WHATSAPP.replace('{instruction}', connection.instruction || '').replace('{number}', WHATSAPP_NUMBER)}
            </p>
            <div className="integration-actions">
              {composeUrl ? (
                <a
                  className="icon-button"
                  href={composeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {INTEGRATION_MESSAGES.CONNECTION.OPEN_WHATSAPP}
                </a>
              ) : null}
              {connection.instruction ? (
                <button
                  className="filter-chip"
                  type="button"
                  onClick={() => { void navigator.clipboard?.writeText(connection.instruction || ''); }}
                >
                  {INTEGRATION_MESSAGES.CONNECTION.COPY_COMMAND}
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="meta" style={{ marginBottom: '8px' }}>{INTEGRATION_MESSAGES.CONNECTION.TELEGRAM_INSTRUCTION}</p>
            <div className="connection-code" aria-label="Connection code">{connection.verificationCode}</div>
            <p>
              {INTEGRATION_MESSAGES.CONNECTION.SEND_TO_TELEGRAM.replace('{instruction}', connection.instruction || '').replace('{username}', TELEGRAM_BOT_USERNAME)}
            </p>
            <div className="integration-actions">
              {composeUrl ? (
                <a
                  className="icon-button"
                  href={composeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {INTEGRATION_MESSAGES.CONNECTION.OPEN_TELEGRAM_BOT}
                </a>
              ) : null}
              {connection.instruction ? (
                <button
                  className="filter-chip"
                  type="button"
                  onClick={() => { void navigator.clipboard?.writeText(connection.instruction || ''); }}
                >
                  {INTEGRATION_MESSAGES.CONNECTION.COPY_COMMAND}
                </button>
              ) : null}
            </div>
          </>
        )}
        {currentSession?.connectedAccount ? <p className="meta">{INTEGRATION_MESSAGES.CONNECTION.CONNECTED_AS.replace('{account}', currentSession.connectedAccount)}</p> : null}
        {currentSession?.lastError ? <InlineMessage tone="error">{currentSession.lastError}</InlineMessage> : null}
      </section>
    </div>
  );
}
