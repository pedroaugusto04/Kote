import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { formatDisplayToken } from '../../shared/utils/format';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';
import { INTEGRATION_LOGOS, INTEGRATION_MESSAGES, IntegrationProvider } from './integrations.constants';
import {
  connectIntegration,
  fetchGithubRepositories,
  fetchGithubBackfillStatus,
  fetchIntegrations,
  fetchIntegrationSession,
  getErrorMessage,
  revokeIntegration,
  saveGithubRepositories,
  startGithubBackfill,
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
import { StoredIntegrationStatus } from '../../shared/api/enums';
import { CDNImage } from '../../shared/ui/CDNImage';
import { GitHubIcon } from '../../shared/ui/icons';
import { BrandMark } from '../../shared/ui/brand-mark';
import { GithubBackfillOptInModal } from './GithubBackfillOptInModal';
import {
  markBackfillDeclined,
  storeBackfillJob,
} from './backfill-storage';

const statusTone: Record<DisplayStatus | string, string> = {
  [StoredIntegrationStatus.Connected]: 'low',
  [StoredIntegrationStatus.Missing]: 'high',
  [StoredIntegrationStatus.Revoked]: 'medium',
  [StoredIntegrationStatus.Pending]: 'medium',
  [StoredIntegrationStatus.Error]: 'high',
  [StoredIntegrationStatus.Disabled]: 'medium',
  expired: 'high',
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

const WHATSAPP_NUMBER = INTEGRATION_MESSAGES.WHATSAPP_NUMBER;
const TELEGRAM_BOT_USERNAME = INTEGRATION_MESSAGES.TELEGRAM_BOT_USERNAME;

function buildChatComposeUrl(connection: IntegrationConnectionResponse): string {
  const text = (connection.instruction || '').trim();
  if (!text) return '';
  const encoded = encodeURIComponent(text);
  if (connection.provider === IntegrationProvider.Whatsapp) return `${INTEGRATION_MESSAGES.WHATSAPP_BASE_URL}${WHATSAPP_NUMBER}?text=${encoded}`;
  if (connection.provider === IntegrationProvider.Telegram) return `${INTEGRATION_MESSAGES.TELEGRAM_BASE_URL}${TELEGRAM_BOT_USERNAME}`;
  return '';
}

function IntegrationLogo({ integration }: { integration: UserIntegration }) {
  if (integration.provider === IntegrationProvider.PushNotifications) {
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
  const logo = INTEGRATION_LOGOS[integrationId(integration)];
  if (!logo) return <div className="integration-logo-fallback">{integration.name.slice(0, 2).toUpperCase()}</div>;
  const logoClassName = integration.provider === IntegrationProvider.GithubApp
    ? 'integration-logo integration-logo-github-app'
    : 'integration-logo';

  const fallback = <div className="integration-logo-fallback">{integration.name.slice(0, 2).toUpperCase()}</div>;

  return (
    <CDNImage
      alt={`${logo.label} logo`}
      className={logoClassName}
      src={logo.src}
      fallback={fallback}
    />
  );
}

function IntegrationSteps({ integration }: { integration: UserIntegration }) {
  const steps = integration.steps?.length ? integration.steps : [INTEGRATION_MESSAGES.DEFAULT_STEP];
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
    enabled: session?.status === StoredIntegrationStatus.Pending,
    refetchInterval: (query) => query.state.data?.session.status === StoredIntegrationStatus.Pending ? 2500 : false,
  });
  const currentSession = sessionQuery.data?.session || session;
  const providerLabel = connection.provider === IntegrationProvider.Telegram ? INTEGRATION_MESSAGES.PROVIDER_LABELS[IntegrationProvider.Telegram] : INTEGRATION_MESSAGES.PROVIDER_LABELS[IntegrationProvider.Whatsapp];

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
              {currentSession ? <Badge value={formatDisplayToken(currentSession.status)} tone={statusTone[currentSession.status] || 'medium'} /> : null}
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

function GithubRepositoriesModal({ workspaceSlug, onClose, onSaved }: { workspaceSlug: string; onClose: () => void; onSaved?: (repositories: string[]) => void }) {
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
    onSuccess: (_result, values) => {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      notifySuccess(INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.SUCCESS);
      closeGuard.resetCloseGuard();
      const savedRepositories = repositories
        .filter((repo) => values.repositories.includes(repo.id))
        .map((repo) => repo.fullName);
      onSaved?.(savedRepositories);
      onClose();
    },
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<GithubRepositoriesFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.ERROR_SAVE);
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
              <div className="card-kicker">{IntegrationProvider.GithubApp}</div>
              <h2 id="github-repositories-title">{INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.TITLE}</h2>
            </div>
            <button aria-label={UI_MESSAGES.CLOSE_DETAILS} className="modal-close" type="button" onClick={closeGuard.requestClose}>x</button>
          </div>

          {repositoriesQuery.isLoading ? <p className="meta">{INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.LOADING}</p> : null}
          {repositoriesQuery.isError ? <InlineMessage tone="error">{getErrorMessage(repositoriesQuery.error, INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.ERROR)}</InlineMessage> : null}
          <form
            className="auth-form"
            ref={formRef}
            noValidate
            onSubmit={handleSubmit(
              (values) => saveMutation.mutate(values),
              (invalidErrors) => window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors))),
            )}
          >
            <div className="repository-picker" data-field="repositories" aria-label={INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.REPOSITORY_LIST_ARIA}>
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
                    <small>{repository.private ? UI_MESSAGES.PRIVATE : UI_MESSAGES.PUBLIC}</small>
                  </span>
                </label>
              ))}
            </div>
            {errors.repositories?.message ? <p className="form-error" role="alert">{errors.repositories.message}</p> : null}
            <div className="integration-card-foot">
              <span className="meta">{INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.SELECTED.replace('{count}', String(selected.length))}</span>
              <FormActions disabled={saveMutation.isPending} onCancel={closeGuard.requestClose} submitLabel={INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.SAVE} />
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
      notifySuccess(INTEGRATION_MESSAGES.PUSH_NOTIFICATIONS.DEACTIVATED.replace('{name}', integration.name));
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceSlug] });
    },
  });
  const connected = integration.status === StoredIntegrationStatus.Connected;
  const actionLabel = connected ? integration.primaryAction?.label || INTEGRATION_MESSAGES.GENERAL.REVOKE : integration.primaryAction?.label || INTEGRATION_MESSAGES.GENERAL.CONNECT;
  const actionError = connectMutation.isError
    ? getErrorMessage(connectMutation.error, INTEGRATION_MESSAGES.GENERAL.ACTIVATE_ERROR)
    : revokeMutation.isError
      ? getErrorMessage(revokeMutation.error, INTEGRATION_MESSAGES.GENERAL.REVOKE_ERROR)
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
        {integration.connectedAccount ? <p className="meta">{INTEGRATION_MESSAGES.GENERAL.ACCOUNT_LABEL.replace('{account}', integration.connectedAccount)}</p> : null}
        {integration.lastError ? <InlineMessage tone="error">{integration.lastError}</InlineMessage> : null}
        {actionError ? <InlineMessage tone="error">{actionError}</InlineMessage> : null}
      </div>
      <div className="integration-card-foot">
        <Badge value={formatDisplayToken(integration.status)} tone={statusTone[integration.status] || 'medium'} />
        <div className="integration-actions">
          {integration.provider === IntegrationProvider.GithubApp && connected ? <button className="filter-chip" type="button" onClick={onGithubRepositories}>{INTEGRATION_MESSAGES.GITHUB_REPOSITORIES.REPOSITORIES_BUTTON}</button> : null}
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

  if (!workspaceSlug) return <EmptyState>{INTEGRATION_MESSAGES.GENERAL.CREATE_WORKSPACE_REQUIRED}</EmptyState>;
  if (integrationsQuery.isLoading) return <EmptyState>{INTEGRATION_MESSAGES.GENERAL.LOADING}</EmptyState>;
  if (!integrationsQuery.data) return <InlineMessage tone="error">{getErrorMessage(integrationsQuery.error, INTEGRATION_MESSAGES.GENERAL.LOAD_ERROR)}</InlineMessage>;

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
