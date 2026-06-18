import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { formatDisplayToken } from '../../shared/utils/format';
import {
  connectIntegration,
  fetchGithubRepositories,
  fetchIntegrations,
  fetchIntegrationSession,
  getErrorMessage,
  revokeIntegration,
  saveGithubRepositories,
  fetchPushPublicKey,
  subscribePush,
  unsubscribePush,
} from '../../shared/api/client';
import { githubRepositoriesFormSchema, type DisplayStatus, type GithubRepositoriesFormValues } from './guided-integrations.forms';
import type { GithubIntegrationRepository, IntegrationConnectionResponse, UserIntegration } from '../../shared/api/models/integration';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../../shared/forms/errors';
import { FormActions } from '../../shared/forms/fields';
import { notifySuccess } from '../../shared/ui/notifications';
import { ConfirmationModal } from '../../shared/ui/confirmation-modal';
import { discardChangesConfirmationCopy, useModalCloseGuard } from '../../shared/ui/use-modal-close-guard';
import { Badge, EmptyState, InlineMessage, Panel } from '../../shared/ui/primitives';
import { useGlobalLoading } from '../../app/global-loading';
import { withFrontendBasePath } from '../../app/base-path';

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
  'push-notifications': { src: 'https://cdn.simpleicons.org/pushover/3B5998', label: 'Push Notifications' },
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

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

const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || '5531992504889';
const TELEGRAM_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'kb_notes_bot';

function buildChatComposeUrl(connection: IntegrationConnectionResponse): string {
  const text = (connection.instruction || '').trim();
  if (!text) return '';
  const encoded = encodeURIComponent(text);
  if (connection.provider === 'whatsapp') return `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
  if (connection.provider === 'telegram') return `https://t.me/${TELEGRAM_BOT_USERNAME}`;
  return '';
}

function IntegrationLogo({ integration }: { integration: UserIntegration }) {
  if (integration.provider === 'push-notifications') {
    return (
      <div
        className="integration-logo"
        style={{
          display: 'grid',
          placeItems: 'center',
          background: 'var(--surface-6)',
          padding: '9px',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="var(--cyan)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </div>
    );
  }
  const logo = integrationLogos[integrationId(integration)];
  if (!logo) return <div className="integration-logo-fallback">{integration.name.slice(0, 2).toUpperCase()}</div>;
  const logoClassName = integration.provider === 'github-app'
    ? 'integration-logo integration-logo-github-app'
    : 'integration-logo';
  return <img alt={`${logo.label} logo`} className={logoClassName} src={logo.src} />;
}

function IntegrationSteps({ integration }: { integration: UserIntegration }) {
  const steps = integration.steps?.length ? integration.steps : ['Start the connection to enable this integration.'];
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

  const isWhatsApp = connection.provider === 'whatsapp';

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section aria-labelledby="connection-title" aria-modal="true" className="modal-panel integration-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="card-kicker">{connection.provider}</div>
            <div className="integration-modal-title">
              <h2 id="connection-title">Connect {providerLabel}</h2>
              {currentSession ? <Badge value={formatDisplayToken(currentSession.status)} tone={statusTone[currentSession.status] || 'medium'} /> : null}
            </div>
          </div>
          <button aria-label="Close details" className="modal-close" type="button" onClick={onClose}>x</button>
        </div>

        {isWhatsApp ? (
          <>
            <p className="meta" style={{ marginBottom: '8px' }}>Send the command below to the Knowledge Vault WhatsApp bot:</p>
            <div className="connection-code" aria-label="Connection code">{connection.verificationCode}</div>
            <p>
              Send <strong>{connection.instruction}</strong> to{' '}
              <strong>+{WHATSAPP_NUMBER}</strong>.
            </p>
            <div className="integration-actions">
              {composeUrl ? (
                <a
                  className="icon-button"
                  href={composeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open WhatsApp
                </a>
              ) : null}
              {connection.instruction ? (
                <button
                  className="filter-chip"
                  type="button"
                  onClick={() => { void navigator.clipboard?.writeText(connection.instruction || ''); }}
                >
                  Copy command
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="meta" style={{ marginBottom: '8px' }}>Send the command below to the Knowledge Vault Telegram bot:</p>
            <div className="connection-code" aria-label="Connection code">{connection.verificationCode}</div>
            <p>
              Send <strong>{connection.instruction}</strong> to{' '}
              <strong>@{TELEGRAM_BOT_USERNAME}</strong>.
            </p>
            <div className="integration-actions">
              {composeUrl ? (
                <a
                  className="icon-button"
                  href={composeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Telegram bot
                </a>
              ) : null}
              {connection.instruction ? (
                <button
                  className="filter-chip"
                  type="button"
                  onClick={() => { void navigator.clipboard?.writeText(connection.instruction || ''); }}
                >
                  Copy command
                </button>
              ) : null}
            </div>
          </>
        )}
        {currentSession?.connectedAccount ? <p className="meta">Connected as {currentSession.connectedAccount}</p> : null}
        {currentSession?.lastError ? <InlineMessage tone="error">{currentSession.lastError}</InlineMessage> : null}
      </section>
    </div>
  );
}

function GithubRepositoriesModal({ workspaceSlug, onClose, onSaved }: { workspaceSlug: string; onClose: () => void; onSaved?: () => void }) {
  const queryClient = useQueryClient();
  const globalLoading = useGlobalLoading();
  const formRef = useRef<HTMLFormElement>(null);
  const repositoriesQuery = useQuery({ queryKey: ['github-repositories', workspaceSlug], queryFn: () => fetchGithubRepositories(workspaceSlug) });
  const {
    formState: { errors, isDirty },
    handleSubmit,
    reset,
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
  const closeGuard = useModalCloseGuard({ isDirty, onClose });

  useEffect(() => {
    if (repositoriesQuery.data) {
      reset({
        repositories: repositoriesQuery.data.repositories.filter((repo) => repo.selected).map((repo) => repo.id),
      });
    }
  }, [repositoriesQuery.data, reset]);

  const saveMutation = useMutation({
    mutationFn: (values: GithubRepositoriesFormValues) => globalLoading.trackPromise(saveGithubRepositories(
      workspaceSlug,
      repositories.filter((repo) => values.repositories.includes(repo.id)).map((repo) => ({ id: repo.id, fullName: repo.fullName })),
    )),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      notifySuccess('Repositories saved successfully.');
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
      notifyGeneralFormError(error, 'Could not save the selected repositories.');
    },
  });

  const toggle = (repository: GithubIntegrationRepository) => {
    setValue('repositories', selected.includes(repository.id)
      ? selected.filter((item) => item !== repository.id)
      : [...selected, repository.id], { shouldDirty: true, shouldValidate: true });
  };

  return (
    <>
      <div className="modal-backdrop" role="presentation" onClick={closeGuard.requestClose}>
      <section aria-labelledby="github-repositories-title" aria-modal="true" className="modal-panel integration-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="card-kicker">github-app</div>
            <h2 id="github-repositories-title">Select repositories</h2>
          </div>
          <button aria-label="Close details" className="modal-close" type="button" onClick={closeGuard.requestClose}>x</button>
        </div>

        {repositoriesQuery.isLoading ? <p className="meta">Loading repositories...</p> : null}
        {repositoriesQuery.isError ? <InlineMessage tone="error">{getErrorMessage(repositoriesQuery.error, 'Could not load repositories.')}</InlineMessage> : null}
        <form
          className="auth-form"
          ref={formRef}
          noValidate
          onSubmit={handleSubmit(
            (values) => saveMutation.mutate(values),
            (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
          )}
        >
          <div className="repository-picker" data-field="repositories" aria-label="GitHub repository list">
            {repositories.map((repository) => (
              <label className="repository-option" key={repository.id}>
                <input
                  checked={selected.includes(repository.id)}
                  disabled={saveMutation.isPending}
                  name="repositories"
                  type="checkbox"
                  value={repository.id}
                  onChange={() => toggle(repository)}
                />
                <span>
                  <strong>{repository.fullName}</strong>
                  <small>{repository.private ? 'Private' : 'Public'}</small>
                </span>
              </label>
            ))}
          </div>
          {errors.repositories?.message ? <p className="form-error" role="alert">{errors.repositories.message}</p> : null}
          <div className="integration-card-foot">
            <span className="meta">{selected.length} selected</span>
            <FormActions disabled={saveMutation.isPending} onCancel={closeGuard.requestClose} submitLabel="Save" />
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
  const globalLoading = useGlobalLoading();
  const connectMutation = useMutation({
    mutationFn: async () => {
      if (integration.provider === 'push-notifications') {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          throw new Error('Navegador não suporta notificações Push.');
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          throw new Error('Permissão para notificações foi negada.');
        }

        const registration = await navigator.serviceWorker.register(withFrontendBasePath('/sw.js'));
        await navigator.serviceWorker.ready;

        const { publicKey } = await fetchPushPublicKey();
        if (!publicKey) {
          throw new Error('Chave pública VAPID não configurada no servidor.');
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        const keys = subscription.toJSON().keys || {};
        const p256dh = keys.p256dh || '';
        const auth = keys.auth || '';

        await subscribePush({
          endpoint: subscription.endpoint,
          p256dh,
          auth,
        });

        return { ok: true };
      }
      return connectIntegration({ provider: integration.provider, workspaceSlug, returnToPath });
    },
    onSuccess: (result: any) => {
      if (integration.provider === 'push-notifications') {
        notifySuccess('Notificações Push ativadas com sucesso.');
        queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
        return;
      }
      if (result.primaryAction?.url) {
        openExternalIntegration(result.primaryAction.url, integration.provider === 'github-app' ? '_self' : '_blank');
        return;
      }
      if (result.session) onCodeConnection(result);
      if (!result.primaryAction?.url && !result.session) notifySuccess(`${integration.name} updated successfully.`);
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
    },
  });
  const revokeMutation = useMutation({
    mutationFn: async () => {
      if (integration.provider === 'push-notifications') {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            await subscription.unsubscribe();
            try {
              await unsubscribePush(subscription.endpoint);
            } catch (e) {
              // ignore
            }
          }
        }
      }
      return revokeIntegration(integration.provider, workspaceSlug);
    },
    onSuccess: () => {
      notifySuccess(`${integration.name} desativado com sucesso.`);
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
    },
  });
  const connected = integration.status === 'connected';
  const actionLabel = connected ? integration.primaryAction?.label || 'Revoke' : integration.primaryAction?.label || 'Connect';
  const actionError = connectMutation.isError
    ? getErrorMessage(connectMutation.error, 'Could not activate this integration.')
    : revokeMutation.isError
      ? getErrorMessage(revokeMutation.error, 'Could not revoke this integration.')
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
        {integration.connectedAccount ? <p className="meta">Account: {integration.connectedAccount}</p> : null}
        {integration.lastError ? <InlineMessage tone="error">{integration.lastError}</InlineMessage> : null}
        {actionError ? <InlineMessage tone="error">{actionError}</InlineMessage> : null}
      </div>
      <div className="integration-card-foot">
        <Badge value={formatDisplayToken(integration.status)} tone={statusTone[integration.status] || 'medium'} />
        <div className="integration-actions">
          {integration.provider === 'github-app' && connected ? <button className="filter-chip" type="button" onClick={onGithubRepositories}>Repositories</button> : null}
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
      {status === 'connected' ? 'GitHub connected. Select the workspace repositories.' : 'Could not complete the GitHub connection.'}
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
  children,
}: {
  workspaceSlug: string;
  returnToPath: string;
  providers?: string[];
  defaultOpenGithubRepositories?: boolean;
  onGithubRepositoriesSaved?: () => void;
  onLoaded?: (integrations: UserIntegration[]) => void;
  children?: React.ReactNode;
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

  if (!workspaceSlug) return <EmptyState>Create a workspace to continue.</EmptyState>;
  if (integrationsQuery.isLoading) return <EmptyState>Loading integrations...</EmptyState>;
  if (!integrationsQuery.data) return <InlineMessage tone="error">{getErrorMessage(integrationsQuery.error, 'Could not load integration status.')}</InlineMessage>;

  const cards = integrations.map((integration) => (
    <IntegrationCard
      integration={integration}
      key={integrationId(integration)}
      workspaceSlug={workspaceSlug}
      returnToPath={returnToPath}
      onCodeConnection={setCodeConnection}
      onGithubRepositories={() => setShowGithubRepositories(true)}
    />
  ));

  return (
    <>
      <section className="grid cols-2 integrations-grid">
        {cards}
        {children}
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
