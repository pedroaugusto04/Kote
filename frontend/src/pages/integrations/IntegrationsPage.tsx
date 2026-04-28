import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchIntegrations, revokeIntegration, saveIntegration } from '../../shared/api/client';
import type { IntegrationStatus, IntegrationStatusValue, UserIntegration } from '../../shared/api/models/integration';
import { Badge, EmptyState, PageHead, Panel, Tags } from '../../shared/ui/primitives';

type DisplayIntegration = IntegrationStatus | UserIntegration;
type DisplayStatus = IntegrationStatusValue | UserIntegration['status'];

const statusLabel: Record<DisplayStatus, string> = {
  connected: 'conectado',
  partial: 'parcial',
  missing: 'pendente',
  revoked: 'revogado',
};

const statusTone: Record<DisplayStatus, string> = {
  connected: 'low',
  partial: 'medium',
  missing: 'high',
  revoked: 'medium',
};

const integrationLogos: Record<string, { src: string; label: string }> = {
  'github-app': { src: 'https://cdn.simpleicons.org/github/ffffff', label: 'GitHub' },
  webhooks: { src: 'https://cdn.simpleicons.org/n8n/EA4B71', label: 'n8n' },
  whatsapp: { src: 'https://cdn.simpleicons.org/whatsapp/25D366', label: 'WhatsApp' },
  telegram: { src: 'https://cdn.simpleicons.org/telegram/26A5E4', label: 'Telegram' },
  ai: { src: 'https://cdn.simpleicons.org/openrouter/ffffff', label: 'OpenRouter' },
  evolution: { src: 'https://cdn.simpleicons.org/whatsapp/25D366', label: 'Evolution API' },
  github: { src: 'https://cdn.simpleicons.org/github/ffffff', label: 'GitHub' },
  'ai-review': { src: 'https://cdn.simpleicons.org/openai/ffffff', label: 'AI Review' },
  'ai-conversation': { src: 'https://cdn.simpleicons.org/openai/ffffff', label: 'AI Conversation' },
};

function integrationId(integration: DisplayIntegration) {
  return 'id' in integration ? integration.id : integration.provider;
}

function isLegacyIntegration(integration: DisplayIntegration): integration is IntegrationStatus {
  return 'id' in integration;
}

function IntegrationLogo({ integration }: { integration: DisplayIntegration }) {
  const logo = integrationLogos[integrationId(integration)];
  if (!logo) return <div className="integration-logo-fallback">{integration.name.slice(0, 2).toUpperCase()}</div>;
  return <img alt={`${logo.label} logo`} className="integration-logo" src={logo.src} />;
}

function ConfigEditor({ integration, workspaceSlug }: { integration: UserIntegration; workspaceSlug: string }) {
  const queryClient = useQueryClient();
  const [configText, setConfigText] = useState('{}');
  const [identityProvider, setIdentityProvider] = useState('');
  const [externalId, setExternalId] = useState('');
  const [error, setError] = useState('');

  const saveMutation = useMutation({
    mutationFn: async () => {
      setError('');
      let config: Record<string, string>;
      try {
        config = JSON.parse(configText) as Record<string, string>;
      } catch {
        setError('JSON invalido.');
        throw new Error('invalid_json');
      }
      return saveIntegration({
        provider: integration.provider,
        workspaceSlug,
        config,
        publicMetadata: { label: integration.name },
        externalIdentities: identityProvider && externalId ? [{ provider: identityProvider, externalId }] : [],
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeIntegration(integration.provider, workspaceSlug),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });

  return (
    <div className="integration-section">
      <h3>Credenciais</h3>
      {Object.keys(integration.maskedConfig).length > 0 ? <Tags items={Object.entries(integration.maskedConfig).map(([key, value]) => `${key}: ${value}`)} /> : <p>Nenhuma credencial salva.</p>}
      <label className="form-field">
        <span>Config JSON</span>
        <textarea value={configText} onChange={(event) => setConfigText(event.target.value)} />
      </label>
      <div className="form-grid">
        <label className="form-field">
          <span>Identidade externa</span>
          <input placeholder="telegram, whatsapp, github" value={identityProvider} onChange={(event) => setIdentityProvider(event.target.value)} />
        </label>
        <label className="form-field">
          <span>ID externo</span>
          <input placeholder="chat id, jid, username" value={externalId} onChange={(event) => setExternalId(event.target.value)} />
        </label>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="toolbar">
        <button className="icon-button" disabled={saveMutation.isPending} type="button" onClick={() => saveMutation.mutate()}>
          Salvar
        </button>
        <button className="filter-chip" disabled={revokeMutation.isPending || integration.status === 'missing'} type="button" onClick={() => revokeMutation.mutate()}>
          Revogar
        </button>
      </div>
    </div>
  );
}

function IntegrationDetailsModal({ integration, workspaceSlug, onClose }: { integration: DisplayIntegration; workspaceSlug: string; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-labelledby="integration-details-title"
        aria-modal="true"
        className="modal-panel integration-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div className="integration-modal-title">
            <IntegrationLogo integration={integration} />
            <div>
              <div className="card-kicker">{integrationId(integration)}</div>
              <h2 id="integration-details-title">{integration.name}</h2>
            </div>
          </div>
          <button aria-label="Fechar detalhes" className="modal-close" type="button" onClick={onClose}>
            x
          </button>
        </div>

        <p>{integration.description}</p>

        {isLegacyIntegration(integration) ? (
          <>
            <div className="integration-section">
              <h3>Checklist</h3>
              <ul className="checklist">
                {integration.checklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            {integration.missingEnv.length > 0 ? (
              <div className="integration-section">
                <h3>Variaveis ausentes</h3>
                <Tags items={integration.missingEnv} />
              </div>
            ) : null}

            {integration.configuredEnv.length > 0 ? (
              <div className="integration-section">
                <h3>Configuradas</h3>
                <Tags items={integration.configuredEnv} />
              </div>
            ) : null}

            {integration.links.length > 0 ? (
              <div className="integration-section">
                <h3>URLs</h3>
                <div className="integration-links">
                  {integration.links.map((item) => (
                    <a className="integration-link" href={item.url} key={`${item.label}:${item.url}`} rel="noreferrer" target={item.external ? '_blank' : undefined}>
                      <span>{item.label}</span>
                      <code>{item.url}</code>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {integration.warnings.length > 0 ? (
              <div className="integration-section">
                <h3>Atencao</h3>
                <ul className="warning-list">
                  {integration.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : <ConfigEditor integration={integration} workspaceSlug={workspaceSlug} />}
      </section>
    </div>
  );
}

function IntegrationCard({ integration, onInfo }: { integration: DisplayIntegration; onInfo: (integration: DisplayIntegration) => void }) {
  const pendingCount = isLegacyIntegration(integration) ? integration.missingEnv.length + integration.warnings.length : integration.status === 'connected' ? 0 : 1;

  return (
    <Panel className="integration-card">
      <button aria-label={`Ver detalhes de ${integration.name}`} className="integration-info-button" type="button" onClick={() => onInfo(integration)}>
        i
      </button>
      <div className="integration-card-head">
        <IntegrationLogo integration={integration} />
        <div>
          <h2>{integration.name}</h2>
          <p>{integration.description}</p>
        </div>
      </div>
      <div className="integration-card-foot">
        <Badge value={statusLabel[integration.status]} tone={statusTone[integration.status]} />
        {pendingCount > 0 ? <span className="meta">{pendingCount} pendencia</span> : <span className="meta">pronto para uso</span>}
      </div>
    </Panel>
  );
}

export function IntegrationsPage() {
  const integrationsQuery = useQuery({ queryKey: ['integrations'], queryFn: fetchIntegrations });
  const [selectedIntegration, setSelectedIntegration] = useState<DisplayIntegration | null>(null);

  if (integrationsQuery.isLoading) return <EmptyState>Carregando integracoes...</EmptyState>;
  if (!integrationsQuery.data) return <EmptyState>Nao foi possivel carregar o status das integracoes.</EmptyState>;

  return (
    <>
      <PageHead
        title="Integracoes"
        subtitle={`Credenciais do workspace ${integrationsQuery.data.workspaceSlug}. Segredos sao salvos criptografados e exibidos mascarados.`}
      />
      <section className="grid cols-2 integrations-grid">
        {integrationsQuery.data.integrations.map((integration) => (
          <IntegrationCard integration={integration} key={integrationId(integration)} onInfo={setSelectedIntegration} />
        ))}
      </section>
      {selectedIntegration ? <IntegrationDetailsModal integration={selectedIntegration} workspaceSlug={integrationsQuery.data.workspaceSlug} onClose={() => setSelectedIntegration(null)} /> : null}
    </>
  );
}
