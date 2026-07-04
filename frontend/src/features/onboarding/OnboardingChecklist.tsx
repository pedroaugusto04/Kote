import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchGithubBackfillStatus, fetchIntegrations, fetchGithubRepositories, fetchCurrentUser, cancelGithubBackfill } from '../../shared/api/client';
import type { Dashboard } from '../../shared/api/models/dashboard';
import type { UserIntegration } from '../../shared/api/models/integration';
import { routes } from '../../app/routing/routes';
import { withFrontendBasePath } from '../../app/base-path';
import { useGlobalLoading } from '../../app/global-loading';
import { Panel } from '../../shared/ui/primitives';
import { notifySuccess } from '../../shared/ui/notifications';
import { notifyGeneralFormError } from '../../shared/forms/errors';
import { INTEGRATION_MESSAGES } from '../integrations/integrations.constants';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';
import { QUERY_KEYS } from '../../shared/constants/query-keys.constants';
import { CDNImage } from '../../shared/ui/CDNImage';
import { GithubBackfillOptInModal } from '../integrations/GithubBackfillOptInModal';
import {
  readBackfillJobId,
  storeBackfillJob,
} from '../integrations/backfill-storage';

/** localStorage key for onboarding state. */
const STORAGE_KEY = 'kb-onboarding-checklist';

type OnboardingStorage = {
  dismissed: boolean;
  dismissedAt: string | null;
  showLaterAt: string | null;
  completionAcknowledged: boolean;
};

function loadStorage(): OnboardingStorage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { dismissed: false, dismissedAt: null, showLaterAt: null, completionAcknowledged: false };
    const parsed = JSON.parse(raw) as Partial<OnboardingStorage>;
    return {
      dismissed: parsed.dismissed === true,
      dismissedAt: parsed.dismissedAt || null,
      showLaterAt: parsed.showLaterAt || null,
      completionAcknowledged: parsed.completionAcknowledged === true,
    };
  } catch {
    return { dismissed: false, dismissedAt: null, showLaterAt: null, completionAcknowledged: false };
  }
}

function saveStorage(state: OnboardingStorage) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}


type ChecklistItemDef = {
  id: string;
  label: string;
  description: string;
  priority: boolean;
  route?: string;
  provider?: string;
  icon: React.ReactNode;
  optional?: boolean;
};

const CHECKLIST_ITEMS: ChecklistItemDef[] = [
  {
    id: 'github',
    label: 'Connect GitHub',
    description: 'Link your repositories so Kote can capture commits and AI reviews.',
    priority: true,
    route: routes.integrations,
    provider: 'github-app',
    icon: <CDNImage src="https://cdn.simpleicons.org/github/ffffff" style={{ width: '16px', height: '16px', display: 'block' }} alt="GitHub" fallback="⌥" />,
  },
  {
    id: 'github-backfill',
    label: 'Import recent commits',
    description: 'Import recent commits to experience the sync flow and understand how it works.',
    priority: true,
    icon: '⤴',
  },
  {
    id: 'github-push',
    label: 'Make first push',
    description: 'Push code to your linked repository to trigger your first live review.',
    priority: false,
    route: routes.projects,
    icon: '↑',
  },
  {
    id: 'vscode-extension',
    label: 'Install VS Code Extension',
    description: 'Download the Kote extension to sync local files and AI history.',
    priority: true,
    route: '#', // Placeholder route to render as Link
    icon: <img src={withFrontendBasePath('/kote/vscode-logo.svg')} style={{ width: '16px', height: '16px', display: 'block' }} alt="VS Code" />,
  },
  {
    id: 'vscode-sync-chat',
    label: 'Sync your First AI chat',
    description: 'Save an AI session from VS Code Extension to your Kote. (in the Sync tab or passively with auto-save active)',
    priority: true,
    route: routes.home,
    icon: '⚡',
  },
  {
    id: 'ask-ai',
    label: 'Test Ask AI',
    description: 'Ask questions about the knowledge captured in your workspace.',
    priority: false,
    route: routes.search,
    icon: '✦',
  },
  {
    id: 'project-brief',
    label: 'Test Project Brief',
    description: 'Generate a project brief to summarize project documentation.',
    priority: false,
    route: `${routes.search}?tab=brief`,
    icon: '📄',
  },
  {
    id: 'whatsapp',
    label: 'Connect WhatsApp',
    description: 'Capture notes and knowledge via WhatsApp messages.',
    priority: false,
    route: routes.integrations,
    provider: 'whatsapp',
    icon: '💬',
    optional: true,
  },
  {
    id: 'reminder',
    label: 'Set up a reminder',
    description: 'Schedule reminders via WhatsApp to stay on top of tasks.',
    priority: false,
    route: routes.reminders,
    icon: '🔔',
    optional: true,
  },
];

/** The number of days after first dismissal before the checklist auto-hides permanently. */
const AUTO_HIDE_DAYS = 7;

function isIntegrationConnected(integrations: UserIntegration[], provider: string): boolean {
  return integrations.some(
    (i) => i.provider === provider && i.status === 'connected',
  );
}

function getCompletedItems(
  integrations: UserIntegration[],
  dashboard: Dashboard,
  vscodeInstalled: boolean,
  backfillComplete: boolean,
): Set<string> {
  const completed = new Set<string>();

  if (isIntegrationConnected(integrations, 'github-app')
    && dashboard.projects.some((p) => p.repositories.length > 0)) {
    completed.add('github');
  }

  if (backfillComplete) {
    completed.add('github-backfill');
  }

  const totalGithubPushes = dashboard.home.metrics.find((m) => m.id === 'total-github-pushes')?.value ?? 0;
  if (totalGithubPushes > 0) {
    completed.add('github-push');
  }

  if (vscodeInstalled) {
    completed.add('vscode-extension');
  }

  const totalSyncedChats = dashboard.home.metrics.find((m) => m.id === 'total-synced-chats')?.value ?? 0;
  if (totalSyncedChats > 0) {
    completed.add('vscode-sync-chat');
  }

  if (isIntegrationConnected(integrations, 'whatsapp')) {
    completed.add('whatsapp');
  }

  const totalAskQueries = dashboard.home.metrics.find((m) => m.id === 'total-ask-queries')?.value ?? 0;
  if (totalAskQueries > 0) {
    completed.add('ask-ai');
  }

  const totalProjectBriefs = dashboard.home.metrics.find((m) => m.id === 'total-project-briefs')?.value ?? 0;
  if (totalProjectBriefs > 0) {
    completed.add('project-brief');
  }

  const totalReminders = dashboard.home.metrics.find((m) => m.id === 'total-reminders')?.value ?? 0;
  if (totalReminders > 0) {
    completed.add('reminder');
  }

  return completed;
}

function getVisibleItems(
  integrations: UserIntegration[],
  dashboard: Dashboard,
  vscodeInstalled: boolean,
): ChecklistItemDef[] {
  const githubConnected = isIntegrationConnected(integrations, 'github-app')
    && dashboard.projects.some((p) => p.repositories.length > 0);
  const whatsappConnected = isIntegrationConnected(integrations, 'whatsapp');
  const totalNotes = dashboard.home.metrics.find((m) => m.id === 'total-notes')?.value ?? 0;

  return CHECKLIST_ITEMS.filter((item) => {
    if (item.id === 'github-backfill' && !githubConnected) return false;
    if (item.id === 'github-push' && !githubConnected) return false;
    if (item.id === 'vscode-sync-chat' && !vscodeInstalled) return false;
    if (item.id === 'ask-ai' && totalNotes < 3) return false;
    if (item.id === 'project-brief' && totalNotes < 3) return false;
    if (item.id === 'reminder' && !whatsappConnected) return false;
    return true;
  });
}

function OnboardingCompletionPanel({
  dashboard,
  onDismiss,
}: {
  dashboard: Dashboard;
  onDismiss: () => void;
}) {
  const totalNotes = dashboard.home.metrics.find((m) => m.id === 'total-notes')?.value ?? 0;
  const totalGithubPushes = dashboard.home.metrics.find((m) => m.id === 'total-github-pushes')?.value ?? 0;
  const totalSyncedChats = dashboard.home.metrics.find((m) => m.id === 'total-synced-chats')?.value ?? 0;

  return (
    <Panel className="onboarding-checklist onboarding-completion" aria-label="Onboarding complete">
      <div className="onboarding-checklist-head">
        <div>
          <h2>Your technical memory is active</h2>
          <p className="meta">
            Kote is capturing context from your tools. You now have {totalNotes} notes
            {totalGithubPushes > 0 ? `, including ${totalGithubPushes} GitHub review${totalGithubPushes === 1 ? '' : 's'}` : ''}
            {totalSyncedChats > 0 ? ` and ${totalSyncedChats} synced AI chat${totalSyncedChats === 1 ? '' : 's'}` : ''}.
          </p>
        </div>
      </div>
      <div className="onboarding-checklist-foot">
        <Link className="icon-button" to={routes.search}>Ask a question</Link>
        <button className="onboarding-dismiss muted" type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </Panel>
  );
}

export function OnboardingChecklist({
  dashboard,
  workspaceSlug,
}: {
  dashboard: Dashboard;
  workspaceSlug: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [storage, setStorage] = useState(loadStorage);
  const [showOptional, setShowOptional] = useState(false);
  const [showBackfillModal, setShowBackfillModal] = useState(false);

  const currentUserQuery = useQuery({
    queryKey: QUERY_KEYS.AUTH.ME,
    queryFn: fetchCurrentUser,
    staleTime: 30_000,
  });
  const currentUser = currentUserQuery.data?.user;

  const globalLoading = useGlobalLoading();

  const integrationsQuery = useQuery({
    queryKey: ['integrations', workspaceSlug],
    queryFn: () => fetchIntegrations(workspaceSlug),
    enabled: Boolean(workspaceSlug),
  });

  const integrations = integrationsQuery.data?.integrations ?? [];
  const githubConnected = isIntegrationConnected(integrations, 'github-app')
    && dashboard.projects.some((project) => project.repositories.length > 0);

  const githubRepositoriesQuery = useQuery({
    queryKey: ['github-repositories', workspaceSlug],
    queryFn: () => fetchGithubRepositories(workspaceSlug),
    enabled: githubConnected || showBackfillModal,
  });

  const backfillJobId = readBackfillJobId(workspaceSlug);
  const backfillStatusQuery = useQuery({
    queryKey: ['github-backfill-status', workspaceSlug, backfillJobId],
    queryFn: () => fetchGithubBackfillStatus(workspaceSlug, backfillJobId || ''),
    enabled: Boolean(workspaceSlug && backfillJobId),
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      if (!status || status === 'completed' || status === 'failed' || status === 'quota_exceeded') {
        return false;
      }
      return 2500;
    },
  });

  const backfillLimit = integrationsQuery.data?.githubBackfillLimit ?? 5;

  const repositories = githubRepositoriesQuery.data?.repositories || [];
  const selectedRepositories = repositories.filter((repo) => repo.selected).map((repo) => repo.fullName);

  const handleBackfillAction = () => {
    if (backfillComplete) {
      return; // Do nothing if backfill is already complete
    }
    if (selectedRepositories.length === 0) {
      navigate(routes.integrations);
      return;
    }
    setShowBackfillModal(true);
  };

  const handleVscodeExtensionClick = () => {
    window.open('https://marketplace.visualstudio.com/items?itemName=Kote.kote-vscode', '_blank', 'noopener,noreferrer');
  };

  const handleBackfillStarted = (jobId: string) => {
    storeBackfillJob(workspaceSlug, jobId);
    setShowBackfillModal(false);
    void queryClient.invalidateQueries({ queryKey: ['github-backfill-status'] });
  };

  const handleDeclineBackfill = () => {
    setShowBackfillModal(false);
  };

  const backfillJob = backfillStatusQuery.data?.job;
  const backfillRunning = backfillJob?.status === 'queued' || backfillJob?.status === 'running';
  const backfillComplete = Boolean(
    backfillJob?.status === 'completed'
    || backfillJob?.status === 'quota_exceeded'
    || (backfillJob?.imported ?? 0) > 0,
  );

  const totalSyncedChats = dashboard.home.metrics.find((m) => m.id === 'total-synced-chats')?.value ?? 0;
  const vscodeInstalled = Boolean(currentUser?.vsCodeInstalledAt) || totalSyncedChats > 0;

  const completed = useMemo(
    () => getCompletedItems(integrations, dashboard, vscodeInstalled, backfillComplete),
    [integrations, dashboard, vscodeInstalled, backfillComplete],
  );

  const visibleItems = useMemo(
    () => getVisibleItems(integrations, dashboard, vscodeInstalled),
    [integrations, dashboard, vscodeInstalled],
  );

  const coreItems = visibleItems.filter((item) => !item.optional);
  const optionalItems = visibleItems.filter((item) => item.optional);
  const completedCount = coreItems.filter((item) => completed.has(item.id)).length;
  const allDone = completedCount === coreItems.length && coreItems.length > 0;

  useEffect(() => {
    if (!storage.dismissedAt || storage.dismissed) return;
    const dismissedDate = new Date(storage.dismissedAt);
    const daysSince = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince >= AUTO_HIDE_DAYS) {
      const next = { ...storage, dismissed: true };
      setStorage(next);
      saveStorage(next);
    }
  // Only re-run when dismissedAt or dismissed flag changes, not entire storage object
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage.dismissedAt, storage.dismissed]);

  useEffect(() => {
    if (backfillRunning && backfillJob) {
      const imported = backfillJob.imported ?? 0;
      const total = backfillJob.total ?? 0;
      globalLoading.setBackgroundTask({
        label: 'Importing commits',
        count: imported,
        total,
        onCancel: async () => {
          try {
            await cancelGithubBackfill(workspaceSlug, backfillJob.id);
            notifySuccess(INTEGRATION_MESSAGES.GITHUB_BACKFILL.CANCEL_SUCCESS);
            void queryClient.invalidateQueries({ queryKey: ['github-backfill-status'] });
          } catch (error) {
            notifyGeneralFormError(error, INTEGRATION_MESSAGES.GITHUB_BACKFILL.CANCEL_ERROR);
          }
        },
      });
    } else {
      globalLoading.setBackgroundTask(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backfillRunning, backfillJob, globalLoading, workspaceSlug, queryClient]);

  const isHiddenByShowLater = storage.showLaterAt
    ? new Date(storage.showLaterAt).getTime() > Date.now()
    : false;

  if (storage.dismissed || isHiddenByShowLater) return null;
  if (integrationsQuery.isLoading) return null;

  if (allDone && !storage.completionAcknowledged) {
    return (
      <OnboardingCompletionPanel
        dashboard={dashboard}
        onDismiss={() => {
          const next: OnboardingStorage = {
            ...storage,
            completionAcknowledged: true,
            dismissed: true,
            dismissedAt: new Date().toISOString(),
            showLaterAt: null,
          };
          setStorage(next);
          saveStorage(next);
        }}
      />
    );
  }

  if (allDone || storage.completionAcknowledged) return null;

  function handleDismiss() {
    const next: OnboardingStorage = {
      dismissed: true,
      dismissedAt: new Date().toISOString(),
      showLaterAt: null,
      completionAcknowledged: storage.completionAcknowledged,
    };
    setStorage(next);
    saveStorage(next);
  }

  function handleShowLater() {
    const later = new Date();
    later.setHours(later.getHours() + 24);
    const next: OnboardingStorage = {
      dismissed: false,
      dismissedAt: storage.dismissedAt || new Date().toISOString(),
      showLaterAt: later.toISOString(),
      completionAcknowledged: storage.completionAcknowledged,
    };
    setStorage(next);
    saveStorage(next);
  }

  const progressPercent = coreItems.length > 0
    ? Math.round((completedCount / coreItems.length) * 100)
    : 0;

  return (
    <Panel className="onboarding-checklist" id="onboarding-checklist" aria-label={`${UI_MESSAGES.GETTING_STARTED} checklist`}>
      <div className="onboarding-checklist-head">
        <div>
          <h2>{UI_MESSAGES.GETTING_STARTED}</h2>
        </div>
        <div className="onboarding-checklist-progress">
          <div className="onboarding-progress-ring" aria-label={`${progressPercent}% complete`}>
            <svg viewBox="0 0 36 36" className="onboarding-ring-svg">
              <circle
                className="onboarding-ring-track"
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                strokeWidth="3"
              />
              <circle
                className="onboarding-ring-fill"
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                strokeWidth="3"
                strokeDasharray={`${progressPercent} ${100 - progressPercent}`}
                strokeDashoffset="25"
                strokeLinecap="round"
              />
            </svg>
            <span className="onboarding-ring-label">{completedCount}/{coreItems.length}</span>
          </div>
        </div>
      </div>

      <div className="onboarding-checklist-items">
        {coreItems.map((item) => {
          const done = completed.has(item.id);
          const itemAction = item.id === 'github-backfill' 
            ? handleBackfillAction 
            : item.id === 'vscode-extension'
            ? handleVscodeExtensionClick
            : undefined;

          if (item.route) {
            return (
              <Link
                className={`onboarding-item ${done ? 'done' : ''} ${item.priority ? 'priority' : ''}`}
                key={item.id}
                to={item.route}
                id={`onboarding-item-${item.id}`}
                onClick={itemAction}
              >
                <span className={`onboarding-item-check ${done ? 'checked' : ''} onboarding-item-check-${item.id}`} aria-hidden="true">
                  {done ? '✓' : item.icon}
                </span>
                <div className="onboarding-item-copy">
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </div>
                {item.priority && !done ? (
                  <span className="onboarding-item-badge">Priority</span>
                ) : null}
                <span className="onboarding-item-arrow" aria-hidden="true">→</span>
              </Link>
            );
          }

          return (
            <button
              className={`onboarding-item ${done ? 'done' : ''} ${item.priority ? 'priority' : ''} ${item.id === 'github-backfill' && backfillComplete ? 'disabled' : ''}`}
              key={item.id}
              id={`onboarding-item-${item.id}`}
              type="button"
              onClick={itemAction}
              disabled={item.id === 'github-backfill' && backfillComplete}
            >
              <span className={`onboarding-item-check ${done ? 'checked' : ''} onboarding-item-check-${item.id}`} aria-hidden="true">
                {done ? '✓' : item.icon}
              </span>
              <div className="onboarding-item-copy">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </div>
              {item.priority && !done ? (
                <span className="onboarding-item-badge">Priority</span>
              ) : null}
              <span className="onboarding-item-arrow" aria-hidden="true">→</span>
            </button>
          );
        })}
      </div>

      {optionalItems.length > 0 && (
        <div className="onboarding-optional-section">
          <button
            className="onboarding-optional-toggle"
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            aria-expanded={showOptional}
          >
            <span>Optional integrations</span>
            <span className="onboarding-optional-toggle-count">{optionalItems.length}</span>
            <span className={`onboarding-optional-toggle-arrow ${showOptional ? 'open' : ''}`} aria-hidden="true">›</span>
          </button>
          {showOptional && (
            <div className="onboarding-checklist-items onboarding-optional-items">
              {optionalItems.map((item) => {
                const done = completed.has(item.id);

                if (item.route) {
                  return (
                    <Link
                      className={`onboarding-item optional ${done ? 'done' : ''}`}
                      key={item.id}
                      to={item.route}
                      id={`onboarding-item-${item.id}`}
                    >
                      <span className={`onboarding-item-check ${done ? 'checked' : ''} onboarding-item-check-${item.id}`} aria-hidden="true">
                        {done ? '✓' : item.icon}
                      </span>
                      <div className="onboarding-item-copy">
                        <strong>{item.label}</strong>
                        <span>{item.description}</span>
                        {item.id === 'reminder' && !done && (
                          <button
                            className="onboarding-reminder-test-btn"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const message = 'Remind me to check the onboarding checklist in 1 minute';
                              const number = import.meta.env.VITE_WHATSAPP_NUMBER || '5531992504889';
                              const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
                              window.open(url, '_blank', 'noopener,noreferrer');
                            }}
                          >
                            Send test reminder (1 min)
                          </button>
                        )}
                      </div>
                      <span className="onboarding-item-badge optional-badge">Optional</span>
                      <span className="onboarding-item-arrow" aria-hidden="true">→</span>
                    </Link>
                  );
                }

                return (
                  <button
                    className={`onboarding-item optional ${done ? 'done' : ''}`}
                    key={item.id}
                    id={`onboarding-item-${item.id}`}
                    type="button"
                  >
                    <span className={`onboarding-item-check ${done ? 'checked' : ''} onboarding-item-check-${item.id}`} aria-hidden="true">
                      {done ? '✓' : item.icon}
                    </span>
                    <div className="onboarding-item-copy">
                      <strong>{item.label}</strong>
                      <span>{item.description}</span>
                    </div>
                    <span className="onboarding-item-badge optional-badge">Optional</span>
                    <span className="onboarding-item-arrow" aria-hidden="true">→</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="onboarding-checklist-foot">
        <button className="onboarding-dismiss" type="button" onClick={handleShowLater}>
          Show me later
        </button>
        <button className="onboarding-dismiss muted" type="button" onClick={handleDismiss}>
          Dismiss
        </button>
      </div>

      {showBackfillModal ? (
        <GithubBackfillOptInModal
          workspaceSlug={workspaceSlug}
          repositories={selectedRepositories}
          backfillLimit={backfillLimit}
          onClose={() => setShowBackfillModal(false)}
          onDeclined={handleDeclineBackfill}
          onStarted={handleBackfillStarted}
        />
      ) : null}
    </Panel>
  );
}
