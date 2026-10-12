import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { formatDisplayToken } from '../../shared/utils/format';
import { urlBase64ToUint8Array } from '../../shared/utils/push.utils';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';
import {
  INTEGRATION_MESSAGES,
  INTEGRATION_STATUS_TONE,
  IntegrationProvider,
} from './integrations.constants';
import {
  connectIntegration,
  fetchIntegrations,
  getErrorMessage,
  revokeIntegration,
  fetchPushPublicKey,
  subscribePush,
  unsubscribePush,
  enableDependencyWatcher,
  disableDependencyWatcher,
} from '../../shared/api/client';
import type { IntegrationConnectionResponse, UserIntegration } from '../../shared/api/models/integration';
import { notifySuccess } from '../../shared/ui/notifications';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { Badge, EmptyState, InlineMessage, Panel } from '../../shared/ui/primitives';
import { useGlobalLoading } from '../../app/global-loading';
import { withFrontendBasePath } from '../../app/base-path';
import { StoredIntegrationStatus } from '../../shared/api/enums';
import { BrandMark } from '../../shared/ui/brand-mark';
import { GitHubIcon } from '../../shared/ui/icons';
import { GithubBackfillOptInModal } from './GithubBackfillOptInModal';
import {
  markBackfillDeclined,
  storeBackfillJob,
} from './backfill-storage';
import { GithubPrivacyModal } from './GithubPrivacyModal';
import { DependencyMonitoredRepositoriesModal } from './DependencyMonitoredRepositoriesModal';
import { CodeConnectionModal } from './CodeConnectionModal';
import { GithubRepositoriesModal } from './GithubRepositoriesModal';
import { IntegrationLogo } from './IntegrationLogo';

function openExternalIntegration(url: string, target: '_self' | '_blank' = '_blank') {
  if (target === '_self') {
    window.location.assign(url);
    return;
  }
  window.open(url, target, 'noopener,noreferrer');
}

function IntegrationSteps({ integration }: { integration: UserIntegration }) {
  const steps = integration.steps?.length ? integration.steps : [INTEGRATION_MESSAGES.DEFAULT_STEP];
  return (
    <ol className="integration-steps">
      {steps.map((step) => <li key={step}>{step}</li>)}
    </ol>
  );
}

function IntegrationCard({
  integration,
  workspaceSlug,
  returnToPath,
  githubConnected,
  onCodeConnection,
  onGithubRepositories,
  onDependencyMonitoredRepositories,
}: {
  integration: UserIntegration;
  workspaceSlug: string;
  returnToPath: string;
  githubConnected: boolean;
  onCodeConnection: (connection: IntegrationConnectionResponse) => void;
  onGithubRepositories: () => void;
  onDependencyMonitoredRepositories: () => void;
}) {
  const queryClient = useQueryClient();
  const globalLoading = useGlobalLoading();
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [dependencyWatcherEnabled, setDependencyWatcherEnabled] = useState(integration.status === StoredIntegrationStatus.Connected);

  useEffect(() => {
    if (integration.provider === IntegrationProvider.DependencyWatcher) {
      setDependencyWatcherEnabled(integration.status === StoredIntegrationStatus.Connected);
    }
  }, [integration.provider, integration.status]);

  const enableMutation = useMutation({
    mutationFn: () => enableDependencyWatcher(workspaceSlug),
    onSuccess: () => {
      setDependencyWatcherEnabled(true);
      notifySuccess('Dependency Watcher enabled');
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
    },
    onError: (error) => {
      notifyGeneralFormError(error, 'Could not enable Dependency Watcher');
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => disableDependencyWatcher(workspaceSlug),
    onSuccess: () => {
      setDependencyWatcherEnabled(false);
      notifySuccess('Dependency Watcher disabled');
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
    },
    onError: (error) => {
      notifyGeneralFormError(error, 'Could not disable Dependency Watcher');
    },
  });
  const connectMutation = useMutation({
    mutationFn: async () => {
      if (integration.provider === IntegrationProvider.PushNotifications) {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          throw new Error(INTEGRATION_MESSAGES.PUSH_NOTIFICATIONS.BROWSER_NOT_SUPPORTED);
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          throw new Error(INTEGRATION_MESSAGES.PUSH_NOTIFICATIONS.PERMISSION_DENIED);
        }

        const registration = await navigator.serviceWorker.register(withFrontendBasePath('/sw.js'));
        await navigator.serviceWorker.ready;

        const { publicKey } = await fetchPushPublicKey();
        if (!publicKey) {
          throw new Error(INTEGRATION_MESSAGES.PUSH_NOTIFICATIONS.VAPID_KEY_NOT_CONFIGURED);
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
      if (integration.provider === IntegrationProvider.PushNotifications) {
        notifySuccess(INTEGRATION_MESSAGES.PUSH_NOTIFICATIONS.SUCCESS);
        queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
        return;
      }
      if (result.primaryAction?.url) {
        openExternalIntegration(result.primaryAction.url, integration.provider === IntegrationProvider.GithubApp ? '_self' : '_blank');
        return;
      }
      if (result.session) onCodeConnection(result);
      if (!result.primaryAction?.url && !result.session) notifySuccess(INTEGRATION_MESSAGES.GENERAL.UPDATED_SUCCESS.replace('{name}', integration.name));
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
    },
  });
  const revokeMutation = useMutation({
    mutationFn: async () => {
      if (integration.provider === IntegrationProvider.PushNotifications) {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription());
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
      notifySuccess(INTEGRATION_MESSAGES.PUSH_NOTIFICATIONS.DEACTIVATED.replace('{name}', integration.name));
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
    },
  });
  const connected = integration.status === StoredIntegrationStatus.Connected;
  const unavailable = integration.status === StoredIntegrationStatus.Disabled;
  const actionLabel = connected ? integration.primaryAction?.label || INTEGRATION_MESSAGES.GENERAL.REVOKE : integration.primaryAction?.label || INTEGRATION_MESSAGES.GENERAL.CONNECT;
  const actionError = connectMutation.isError
    ? getErrorMessage(connectMutation.error, INTEGRATION_MESSAGES.GENERAL.ACTIVATE_ERROR)
    : revokeMutation.isError
      ? getErrorMessage(revokeMutation.error, INTEGRATION_MESSAGES.GENERAL.REVOKE_ERROR)
      : '';

  const handleConnectClick = () => {
    if (connected) {
      revokeMutation.mutate();
    } else if (integration.provider === IntegrationProvider.GithubApp) {
      setShowPrivacyModal(true);
    } else {
      connectMutation.mutate();
    }
  };

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
        {integration.provider === IntegrationProvider.GithubApp && !connected ? (
          <InlineMessage tone="warning">Connect to GitHub to select repositories and import dependencies.</InlineMessage>
        ) : null}
        {integration.provider === IntegrationProvider.DependencyWatcher && !githubConnected ? (
          <InlineMessage tone="warning">Connect the GitHub App first, then import dependencies from your repositories.</InlineMessage>
        ) : null}
        {integration.connectedAccount ? <p className="meta">{INTEGRATION_MESSAGES.GENERAL.ACCOUNT_LABEL.replace('{account}', integration.connectedAccount)}</p> : null}
        {integration.lastError ? <InlineMessage tone="error">{integration.lastError}</InlineMessage> : null}
        {actionError ? <InlineMessage tone="error">{actionError}</InlineMessage> : null}
      </div>
      <div className="integration-card-foot">
        <Badge value={formatDisplayToken(integration.status)} tone={INTEGRATION_STATUS_TONE[integration.status] || 'medium'} />
        <div className="integration-actions">
          {integration.provider === IntegrationProvider.GithubApp && connected ? (
            <button className="filter-chip" type="button" onClick={onGithubRepositories}>{INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.REPOSITORIES_BUTTON}</button>
          ) : null}
          {integration.provider === IntegrationProvider.DependencyWatcher ? (
            <>
              <button
                className="filter-chip"
                type="button"
                onClick={onDependencyMonitoredRepositories}
                disabled={!githubConnected}
              >
                Monitored Repositories
              </button>
              <button
                className="filter-chip"
                type="button"
                onClick={() => dependencyWatcherEnabled ? disableMutation.mutate() : enableMutation.mutate()}
                disabled={enableMutation.isPending || disableMutation.isPending}
              >
                {dependencyWatcherEnabled ? 'Disable' : 'Enable'}
              </button>
            </>
          ) : (
            <button
              className={connected ? 'filter-chip' : 'icon-button'}
              disabled={unavailable || connectMutation.isPending || revokeMutation.isPending}
              type="button"
              onClick={handleConnectClick}
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
      {showPrivacyModal && (
        <GithubPrivacyModal
          onClose={() => setShowPrivacyModal(false)}
          onConfirm={() => connectMutation.mutate()}
        />
      )}
    </Panel>
  );
}

export function IntegrationCallbackNotice({ status }: { status: StoredIntegrationStatus.Connected | StoredIntegrationStatus.Error }) {
  return (
    <InlineMessage tone={status === StoredIntegrationStatus.Connected ? 'success' : 'error'}>
      {status === StoredIntegrationStatus.Connected ? UI_MESSAGES.GITHUB_CONNECTED_SUCCESS : UI_MESSAGES.GITHUB_CONNECTION_ERROR}
    </InlineMessage>
  );
}

function GithubSuccessInfoModal({ onClose, onNext }: { onClose: () => void; onNext: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-labelledby="github-success-title"
        aria-modal="true"
        className="modal-panel integration-modal github-success-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
        style={{
          maxWidth: '500px',
          width: '90%',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        <div className="modal-head" style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', border: 'none', padding: 0, margin: 0 }}>
          <button aria-label={UI_MESSAGES.CLOSE_DETAILS} className="modal-close" type="button" onClick={onClose}>x</button>
        </div>

        <div style={{
          width: '100%',
          aspectRatio: '16/10',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          border: '1px solid var(--accent-border)',
          background: 'radial-gradient(circle at center, rgba(125, 211, 165, 0.08) 0%, rgba(9, 15, 20, 0.6) 100%)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '32px',
          position: 'relative',
        }}>
          <style>{`
            @keyframes link-pulse {
              0% { transform: scale(0.95); opacity: 0.8; box-shadow: 0 0 12px rgba(125, 211, 165, 0.2); }
              50% { transform: scale(1.05); opacity: 1; box-shadow: 0 0 24px rgba(125, 211, 165, 0.6); }
              100% { transform: scale(0.95); opacity: 0.8; box-shadow: 0 0 12px rgba(125, 211, 165, 0.2); }
            }
            @keyframes line-flow {
              0% { stroke-dashoffset: 24; }
              100% { stroke-dashoffset: 0; }
            }
          `}</style>

          {/* Left element: Kote brand mark */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: 'var(--brand-mark-bg)',
            border: '1px solid var(--brand-mark-border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 2,
          }}>
            <BrandMark />
          </div>

          {/* Connection line in between with animated path flow */}
          <div style={{
            position: 'relative',
            width: '100px',
            height: '40px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1,
          }}>
            <svg width="100%" height="100%" viewBox="0 0 100 40" fill="none" style={{ overflow: 'visible' }}>
              <path
                d="M 0,20 Q 50,20 100,20"
                stroke="var(--success-border, var(--green))"
                strokeWidth="3"
                strokeDasharray="6 4"
                style={{ animation: 'line-flow 1.5s infinite linear' }}
              />
            </svg>
            <div style={{
              position: 'absolute',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'var(--green)',
              border: '2px solid var(--panel)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--bg)',
              fontWeight: 'bold',
              fontSize: '12px',
              animation: 'link-pulse 2s infinite ease-in-out',
            }}>
              ✓
            </div>
          </div>

          {/* Right element: GitHub logo */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: 'var(--surface-hover)',
            border: '1px solid var(--accent-border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 2,
          }}>
            <GitHubIcon style={{ width: '28px', height: '28px', color: 'var(--text-strong)' }} />
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <h2 id="github-success-title" style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 12px 0', background: 'linear-gradient(135deg, var(--cyan) 0%, var(--primary) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {UI_MESSAGES.GITHUB_CONNECTED}
          </h2>
          <p style={{ color: 'var(--text)', lineHeight: 1.6, fontSize: '15px', margin: 0 }}>
            {INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.SUCCESS_INSTRUCTION}
          </p>
        </div>

        <div className="form-actions" style={{ width: '100%', justifyContent: 'center', marginTop: '8px', gap: '12px' }}>
          <button className="filter-chip" type="button" onClick={onClose} style={{ minWidth: '100px', cursor: 'pointer' }}>
            {UI_MESSAGES.DONE}
          </button>
          <button className="icon-button" type="button" onClick={onNext} style={{ minWidth: '180px', cursor: 'pointer' }}>
            {UI_MESSAGES.SELECT_REPOSITORIES}
          </button>
        </div>
      </section>
    </div>
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
  onGithubRepositoriesSaved?: (repositories: string[]) => void;
  onLoaded?: (integrations: UserIntegration[]) => void;
  children?: React.ReactNode;
}) {
  const [codeConnection, setCodeConnection] = useState<IntegrationConnectionResponse | null>(null);
  const [showGithubRepositories, setShowGithubRepositories] = useState(false);
  const [showGithubSuccessModal, setShowGithubSuccessModal] = useState(false);
  const [showDependencyMonitoredRepositories, setShowDependencyMonitoredRepositories] = useState(false);
  const [pendingBackfillRepositories, setPendingBackfillRepositories] = useState<string[] | null>(null);
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
    if (integrations.some((integration) => integration.provider === IntegrationProvider.GithubApp && integration.status === StoredIntegrationStatus.Connected)) {
      setShowGithubSuccessModal(true);
      didAutoOpen.current = true;
    }
  }, [defaultOpenGithubRepositories, integrations]);

  const backfillLimit = integrationsQuery.data?.githubBackfillLimit ?? 5;
  const githubConnected = integrations.some(
    (item) => item.provider === IntegrationProvider.GithubApp && item.status === StoredIntegrationStatus.Connected,
  );

  if (!workspaceSlug) return <EmptyState>{INTEGRATION_MESSAGES.GENERAL.CREATE_WORKSPACE_REQUIRED}</EmptyState>;
  if (integrationsQuery.isLoading) return <EmptyState>{INTEGRATION_MESSAGES.GENERAL.LOADING}</EmptyState>;
  if (!integrationsQuery.data) return <InlineMessage tone="error">{getErrorMessage(integrationsQuery.error, INTEGRATION_MESSAGES.GENERAL.LOAD_ERROR)}</InlineMessage>;

  const cards = integrations.map((integration) => (
    <IntegrationCard
      integration={integration}
      key={integration.provider}
      workspaceSlug={workspaceSlug}
      returnToPath={returnToPath}
      githubConnected={githubConnected}
      onCodeConnection={setCodeConnection}
      onGithubRepositories={() => setShowGithubRepositories(true)}
      onDependencyMonitoredRepositories={() => setShowDependencyMonitoredRepositories(true)}
    />
  ));

  return (
    <>
      <section className="grid cols-2 integrations-grid">
        {cards}
        {children}
      </section>
      {codeConnection ? <CodeConnectionModal connection={codeConnection} onClose={() => setCodeConnection(null)} workspaceSlug={workspaceSlug} /> : null}
      {showGithubSuccessModal ? (
        <GithubSuccessInfoModal
          onClose={() => setShowGithubSuccessModal(false)}
          onNext={() => {
            setShowGithubSuccessModal(false);
            setShowGithubRepositories(true);
          }}
        />
      ) : null}
      {showGithubRepositories ? (
        <GithubRepositoriesModal
          workspaceSlug={workspaceSlug}
          onClose={() => setShowGithubRepositories(false)}
          onSaved={(repositories) => {
            onGithubRepositoriesSaved?.(repositories);
            if (repositories.length > 0) {
              setPendingBackfillRepositories(repositories);
            }
          }}
        />
      ) : null}
      {showDependencyMonitoredRepositories ? (
        <DependencyMonitoredRepositoriesModal
          workspaceSlug={workspaceSlug}
          onClose={() => setShowDependencyMonitoredRepositories(false)}
        />
      ) : null}
      {pendingBackfillRepositories?.length ? (
        <GithubBackfillOptInModal
          workspaceSlug={workspaceSlug}
          repositories={pendingBackfillRepositories}
          backfillLimit={backfillLimit}
          onClose={() => setPendingBackfillRepositories(null)}
          onDeclined={() => markBackfillDeclined(workspaceSlug)}
          onStarted={(jobId) => {
            storeBackfillJob(workspaceSlug, jobId);
            setPendingBackfillRepositories(null);
          }}
        />
      ) : null}
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
