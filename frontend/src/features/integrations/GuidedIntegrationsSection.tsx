import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
import type { IntegrationConnectionResponse, UserIntegration } from '../../shared/api/models/integration';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../shared/forms/errors';
import { FormActions } from '../../shared/forms/fields';
import { notifySuccess } from '../../shared/ui/notifications';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';
import { discardChangesConfirmationCopy, useModalCloseGuard } from '../../shared/ui/use-modal-close-guard';
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

function openExternalIntegration(url: string, target: '_self' | '_blank' = '_blank') {
  if (target === '_self') {
    window.location.assign(url);
    return;
  }
  window.open(url, target, 'noopener,noreferrer');
}

function buildChatComposeUrl(connection: IntegrationConnectionResponse): string {
  const text = String(connection.instruction || '').trim();
  if (!text) return '';
  const encoded = encodeURIComponent(text);
  if (connection.provider === 'whatsapp') return `https://wa.me/?text=${encoded}`;
  if (connection.provider === 'telegram') return `https://t.me/share/url?url=&text=${encoded}`;
  return '';
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
  const composeUrl = buildChatComposeUrl(connection);
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
            <div className="integration-modal-title">
              <h2 id="connection-title">Conectar {providerLabel}</h2>
              {currentSession ? <Badge value={statusLabel[currentSession.status] || currentSession.status} tone={statusTone[currentSession.status] || 'medium'} /> : null}
            </div>
          </div>
          <button aria-label="Fechar detalhes" className="modal-close" type="button" onClick={onClose}>x</button>
        </div>

        <div className="connection-code" aria-label="Codigo de conexao">{connection.verificationCode}</div>
        <p>Envie <strong>{connection.instruction}</strong> no chat autorizado.</p>
        <div className="integration-actions">
          {composeUrl ? (
            <button className="icon-button" type="button" onClick={() => openExternalIntegration(composeUrl)}>
              {connection.provider === 'telegram' ? 'Abrir Telegram com mensagem' : 'Abrir WhatsApp com mensagem'}
            </button>
          ) : null}
          {connection.instruction ? (
            <button
              className="filter-chip"
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(connection.instruction || '');
              }}
            >
              Copiar comando
            </button>
          ) : null}
        </div>
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
    formState: { errors, isDirty },
    handleSubmit,
    register,
    reset,
    setError,
    watch,
  } = useForm<GithubRepositoriesFormValues>({
    resolver: zodResolver(githubRepositoriesFormSchema),
    shouldFocusError: false,
    defaultValues: { repositories: [] },
  });
  const selected = watch('repositories');
  const repositories = repositoriesQuery.data?.repositories || [];
  const closeGuard = useModalCloseGuard({ isDirty, onClose });

  useEffect(() => {
    if (repositoriesQuery.data) {
      reset({
        repositories: repositoriesQuery.data.repositories.filter((repo) => repo.selected).map((repo) => repo.id),
      });
    }
  }, [repositoriesQuery.data, reset]);

  const saveMutation = useMutation({
    mutationFn: (values: GithubRepositoriesFormValues) => saveGithubRepositories(
      workspaceSlug,
      repositories.filter((repo) => values.repositories.includes(repo.id)).map((repo) => ({ id: repo.id, fullName: repo.fullName })),
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      notifySuccess('Repositorios salvos com sucesso.');
      closeGuard.resetCloseGuard();
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

  return (
    <>
      <div className="modal-backdrop" role="presentation" onClick={closeGuard.requestClose}>
      <section aria-labelledby="github-repositories-title" aria-modal="true" className="modal-panel integration-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="card-kicker">github-app</div>
            <h2 id="github-repositories-title">Selecionar repositorios</h2>
          </div>
          <button aria-label="Fechar detalhes" className="modal-close" type="button" onClick={closeGuard.requestClose}>x</button>
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
          <select
            data-field="repositories"
            multiple
            size={Math.min(Math.max(repositories.length, 4), 10)}
            {...register('repositories')}
            disabled={saveMutation.isPending || repositories.length === 0}
          >
            {repositories.map((repository) => (
              <option key={repository.id} value={repository.id}>
                {repository.fullName}{repository.private ? ' • Privado' : ' • Publico'}
              </option>
            ))}
          </select>
          {errors.repositories?.message ? <p className="form-error" role="alert">{errors.repositories.message}</p> : null}
          <div className="integration-card-foot">
            <span className="meta">{selected.length} selecionados</span>
            <FormActions disabled={saveMutation.isPending} onCancel={closeGuard.requestClose} submitLabel="Salvar" />
          </div>
        </form>
      </section>
      </div>
      {closeGuard.isDiscardConfirmationOpen ? (
        <ConfirmationModal
          cancelLabel={discardChangesConfirmationCopy.cancelLabel}
          confirmLabel={discardChangesConfirmationCopy.confirmLabel}
          description={discardChangesConfirmationCopy.description}
          onCancel={closeGuard.cancelClose}
          onConfirm={closeGuard.confirmClose}
          title={discardChangesConfirmationCopy.title}
          tone="default"
        />
      ) : null}
    </>
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
        openExternalIntegration(result.primaryAction.url, integration.provider === 'github-app' ? '_self' : '_blank');
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
      <div className="integration-card-body">
        <IntegrationSteps integration={integration} />
        {integration.connectedAccount ? <p className="meta">Conta: {integration.connectedAccount}</p> : null}
        {integration.lastError ? <InlineMessage tone="error">{integration.lastError}</InlineMessage> : null}
        {actionError ? <InlineMessage tone="error">{actionError}</InlineMessage> : null}
      </div>
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
      {status === 'connected' ? 'GitHub conectado. Selecione os repositorios do workspace.' : 'Não foi possível concluir a conexão com o GitHub.'}
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
  const queryClient = useQueryClient();
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
    if (!defaultOpenGithubRepositories) return;
    void queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }, [defaultOpenGithubRepositories, queryClient, workspaceSlug]);

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

export function useIntegrationCallback() {
  const location = useLocation();
  return useMemo(() => {
    const search = new URLSearchParams(location.search);
    return {
      integration: search.get('integration'),
      status: search.get('status'),
      workspaceSlug: search.get('workspaceSlug'),
    };
  }, [location.search]);
}
