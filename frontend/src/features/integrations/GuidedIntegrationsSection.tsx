import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import {
  connectIntegration,
  fetchGithubRepositories,
  fetchIntegrations,
  fetchIntegrationSession,
  getErrorMessage,
  revokeIntegration,
  saveGithubRepositories,
} from '../../shared/api/client';
import { githubRepositoriesFormSchema, type DisplayStatus, type GithubRepositoriesFormValues } from './guided-integrations.forms';
import type { GithubIntegrationRepository, IntegrationConnectionResponse, UserIntegration } from '../../shared/api/models/integration';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../shared/forms/errors';
import { FormActions } from '../../shared/forms/fields';
import { notifySuccess } from '../../shared/ui/notifications';
import { Badge, EmptyState, InlineMessage, Panel } from '../../shared/ui/primitives';

const statusLabel: Record<DisplayStatus | string, string> = {
  connected: 'conectado',
  missing: 'pendente',
  revoked: 'revogado',
  pending: 'aguardando',
  expired: 'expirado',
  error: 'erro',
  disabled: 'desativado',
};

const statusTone: Record<DisplayStatus | string, string> = {
  connected: 'low',
  missing: 'high',
  revoked: 'medium',
  pending: 'medium',
  expired: 'high',
  error: 'high',
  disabled: 'medium',
};

const integrationLogos: Record<string, { src: string; label: string }> = {
  'github-app': { src: 'https://cdn.simpleicons.org/github/ffffff', label: 'GitHub' },
  whatsapp: { src: 'https://cdn.simpleicons.org/whatsapp/25D366', label: 'WhatsApp' },
  telegram: { src: 'https://cdn.simpleicons.org/telegram/26A5E4', label: 'Telegram' },
};

function integrationId(integration: UserIntegration) {
  return integration.provider;
}

function openExternalIntegration(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function IntegrationLogo({ integration }: { integration: UserIntegration }) {
  const logo = integrationLogos[integrationId(integration)];
  if (!logo) return <div className="integration-logo-fallback">{integration.name.slice(0, 2).toUpperCase()}</div>;
  return <img alt={`${logo.label} logo`} className="integration-logo" src={logo.src} />;
}

function IntegrationSteps({ integration }: { integration: UserIntegration }) {
  const steps = integration.steps?.length ? integration.steps : ['Inicie a conexao para liberar esta integracao.'];
  return (
    <ol className="integration-steps">
      {steps.map((step) => <li key={step}>{step}</li>)}
    </ol>
  );
}

function CodeConnectionModal({ connection, onClose, workspaceSlug }: { connection: IntegrationConnectionResponse; onClose: () => void; workspaceSlug: string }) {
  const queryClient = useQueryClient();
  const session = connection.session;
  const sessionQuery = useQuery({
    queryKey: ['integration-session', workspaceSlug, connection.provider, session?.id],
    queryFn: () => fetchIntegrationSession({ provider: connection.provider, sessionId: session?.id || '' }),
    enabled: session?.status === 'pending',
    refetchInterval: (query) => query.state.data?.session.status === 'pending' ? 2500 : false,
  });
  const currentSession = sessionQuery.data?.session || session;
  const providerLabel = connection.provider === 'telegram' ? 'Telegram' : 'WhatsApp';

  useEffect(() => {
    if (currentSession?.status === 'connected') {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  }, [currentSession?.status, queryClient, workspaceSlug]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section aria-labelledby="connection-title" aria-modal="true" className="modal-panel integration-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="card-kicker">{connection.provider}</div>
            <h2 id="connection-title">Conectar {providerLabel}</h2>
          </div>
          <button aria-label="Fechar detalhes" className="modal-close" type="button" onClick={onClose}>x</button>
        </div>

        <div className="connection-code" aria-label="Codigo de conexao">{connection.verificationCode}</div>
        <p>Envie <strong>{connection.instruction}</strong> no chat autorizado.</p>
        {connection.pairingUrl ? <a className="integration-link" href={connection.pairingUrl} rel="noreferrer" target="_blank"><span>Abrir pairing</span><code>{connection.pairingUrl}</code></a> : null}
        {currentSession ? <Badge value={statusLabel[currentSession.status] || currentSession.status} tone={statusTone[currentSession.status] || 'medium'} /> : null}
        {currentSession?.connectedAccount ? <p className="meta">Conectado em {currentSession.connectedAccount}</p> : null}
        {currentSession?.lastError ? <InlineMessage tone="error">{currentSession.lastError}</InlineMessage> : null}
      </section>
    </div>
  );
}

function GithubRepositoriesModal({ workspaceSlug, onClose, onSaved }: { workspaceSlug: string; onClose: () => void; onSaved?: () => void }) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const repositoriesQuery = useQuery({ queryKey: ['github-repositories', workspaceSlug], queryFn: () => fetchGithubRepositories(workspaceSlug) });
  const {
    formState: { errors },
    handleSubmit,
    setError,
    setValue,
    watch,
  } = useForm<GithubRepositoriesFormValues>({
    resolver: zodResolver(githubRepositoriesFormSchema),
    shouldFocusError: false,
    defaultValues: { repositories: [] },
  });
  const selected = watch('repositories');
  const repositories = repositoriesQuery.data?.repositories || [];

  useEffect(() => {
    if (repositoriesQuery.data) setValue('repositories', repositoriesQuery.data.repositories.filter((repo) => repo.selected).map((repo) => repo.fullName));
  }, [repositoriesQuery.data, setValue]);

  const saveMutation = useMutation({
    mutationFn: (values: GithubRepositoriesFormValues) => saveGithubRepositories(workspaceSlug, values.repositories),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      notifySuccess('Repositorios salvos com sucesso.');
      onSaved?.();
      onClose();
    },
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<GithubRepositoriesFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, 'Nao foi possivel salvar os repositorios selecionados.');
    },
  });

  const toggle = (repository: GithubIntegrationRepository) => {
    setValue('repositories', selected.includes(repository.fullName)
      ? selected.filter((item) => item !== repository.fullName)
      : [...selected, repository.fullName], { shouldValidate: true });
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section aria-labelledby="github-repositories-title" aria-modal="true" className="modal-panel integration-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="card-kicker">github-app</div>
            <h2 id="github-repositories-title">Selecionar repositorios</h2>
          </div>
          <button aria-label="Fechar detalhes" className="modal-close" type="button" onClick={onClose}>x</button>
        </div>

        {repositoriesQuery.isLoading ? <p className="meta">Carregando repositorios...</p> : null}
        {repositoriesQuery.isError ? <InlineMessage tone="error">{getErrorMessage(repositoriesQuery.error, 'Nao foi possivel carregar os repositorios.')}</InlineMessage> : null}
        <form
          className="auth-form"
          ref={formRef}
          noValidate
          onSubmit={handleSubmit(
            (values) => saveMutation.mutate(values),
            (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
          )}
        >
          <div className="repository-picker" data-field="repositories">
            {repositories.map((repository) => (
              <label className="repository-option" key={repository.fullName}>
                <input checked={selected.includes(repository.fullName)} name="repositories" type="checkbox" value={repository.fullName} onChange={() => toggle(repository)} />
                <span>
                  <strong>{repository.fullName}</strong>
                  <small>{repository.private ? 'Privado' : 'Publico'}</small>
                </span>
              </label>
            ))}
          </div>
          {errors.repositories?.message ? <p className="form-error" role="alert">{errors.repositories.message}</p> : null}
          <div className="integration-card-foot">
            <span className="meta">{selected.length} selecionados</span>
            <FormActions disabled={saveMutation.isPending} onCancel={onClose} submitLabel="Salvar" />
          </div>
        </form>
      </section>
    </div>
  );
}

function IntegrationCard({
  integration,
  workspaceSlug,
  returnToPath,
  onCodeConnection,
  onGithubRepositories,
}: {
  integration: UserIntegration;
  workspaceSlug: string;
  returnToPath: string;
  onCodeConnection: (connection: IntegrationConnectionResponse) => void;
  onGithubRepositories: () => void;
}) {
  const queryClient = useQueryClient();
  const connectMutation = useMutation({
    mutationFn: () => connectIntegration({ provider: integration.provider, workspaceSlug, returnToPath }),
    onSuccess: (result) => {
      if (result.primaryAction?.url) {
        openExternalIntegration(result.primaryAction.url);
        return;
      }
      if (result.session) onCodeConnection(result);
      if (!result.primaryAction?.url && !result.session) notifySuccess(`${integration.name} atualizado com sucesso.`);
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
    },
  });
  const revokeMutation = useMutation({
    mutationFn: () => revokeIntegration(integration.provider, workspaceSlug),
    onSuccess: () => {
      notifySuccess(`${integration.name} revogado com sucesso.`);
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
    },
  });
  const connected = integration.status === 'connected';
  const actionLabel = connected ? integration.primaryAction?.label || 'Revogar' : integration.primaryAction?.label || 'Conectar';
  const actionError = connectMutation.isError
    ? getErrorMessage(connectMutation.error, 'Nao foi possivel ativar esta integracao.')
    : revokeMutation.isError
      ? getErrorMessage(revokeMutation.error, 'Nao foi possivel revogar esta integracao.')
      : '';

  return (
    <Panel className="integration-card">
      <div className="integration-card-head">
        <IntegrationLogo integration={integration} />
        <div>
          <h2>{integration.name}</h2>
          <p>{integration.description}</p>
        </div>
      </div>
      <IntegrationSteps integration={integration} />
      {integration.connectedAccount ? <p className="meta">Conta: {integration.connectedAccount}</p> : null}
      {integration.lastError ? <InlineMessage tone="error">{integration.lastError}</InlineMessage> : null}
      {actionError ? <InlineMessage tone="error">{actionError}</InlineMessage> : null}
      <div className="integration-card-foot">
        <Badge value={statusLabel[integration.status] || integration.status} tone={statusTone[integration.status] || 'medium'} />
        <div className="integration-actions">
          {integration.provider === 'github-app' && connected ? <button className="filter-chip" type="button" onClick={onGithubRepositories}>Repositorios</button> : null}
          <button
            className={connected ? 'filter-chip' : 'icon-button'}
            disabled={connectMutation.isPending || revokeMutation.isPending}
            type="button"
            onClick={() => connected ? revokeMutation.mutate() : connectMutation.mutate()}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </Panel>
  );
}

export function IntegrationCallbackNotice({ status }: { status: 'connected' | 'error' }) {
  return (
    <InlineMessage tone={status === 'connected' ? 'success' : 'error'}>
      {status === 'connected' ? 'GitHub conectado. Falta selecionar os repositorios do workspace.' : 'Nao foi possivel concluir a conexao com o GitHub.'}
    </InlineMessage>
  );
}

export function GuidedIntegrationsSection({
  workspaceSlug,
  returnToPath,
  providers,
  defaultOpenGithubRepositories = false,
  onGithubRepositoriesSaved,
  onLoaded,
}: {
  workspaceSlug: string;
  returnToPath: string;
  providers?: string[];
  defaultOpenGithubRepositories?: boolean;
  onGithubRepositoriesSaved?: () => void;
  onLoaded?: (integrations: UserIntegration[]) => void;
}) {
  const [codeConnection, setCodeConnection] = useState<IntegrationConnectionResponse | null>(null);
  const [showGithubRepositories, setShowGithubRepositories] = useState(false);
  const didAutoOpen = useRef(false);
  const integrationsQuery = useQuery({ queryKey: ['integrations', workspaceSlug], queryFn: () => fetchIntegrations(workspaceSlug), enabled: Boolean(workspaceSlug) });
  const providerSet = useMemo(() => new Set(providers || []), [providers]);
  const integrations = useMemo(() => {
    const items = integrationsQuery.data?.integrations || [];
    if (!providers?.length) return items;
    return items.filter((integration) => providerSet.has(integration.provider));
  }, [integrationsQuery.data?.integrations, providerSet, providers]);

  useEffect(() => {
    onLoaded?.(integrations);
  }, [integrations, onLoaded]);

  useEffect(() => {
    if (didAutoOpen.current || !defaultOpenGithubRepositories) return;
    if (integrations.some((integration) => integration.provider === 'github-app' && integration.status === 'connected')) {
      setShowGithubRepositories(true);
      didAutoOpen.current = true;
    }
  }, [defaultOpenGithubRepositories, integrations]);

  if (!workspaceSlug) return <EmptyState>Crie um workspace para continuar.</EmptyState>;
  if (integrationsQuery.isLoading) return <EmptyState>Carregando integrações...</EmptyState>;
  if (!integrationsQuery.data) return <InlineMessage tone="error">{getErrorMessage(integrationsQuery.error, 'Nao foi possivel carregar o status das integrações.')}</InlineMessage>;

  return (
    <>
      <section className="grid cols-2 integrations-grid">
        {integrations.map((integration) => (
          <IntegrationCard
            integration={integration}
            key={integrationId(integration)}
            workspaceSlug={workspaceSlug}
            returnToPath={returnToPath}
            onCodeConnection={setCodeConnection}
            onGithubRepositories={() => setShowGithubRepositories(true)}
          />
        ))}
      </section>
      {codeConnection ? <CodeConnectionModal connection={codeConnection} onClose={() => setCodeConnection(null)} workspaceSlug={workspaceSlug} /> : null}
      {showGithubRepositories ? <GithubRepositoriesModal workspaceSlug={workspaceSlug} onClose={() => setShowGithubRepositories(false)} onSaved={onGithubRepositoriesSaved} /> : null}
    </>
  );
}
