import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { fetchIntegrations } from '../../shared/api/client';
import type { Dashboard } from '../../shared/api/models/dashboard';
import type { UserIntegration } from '../../shared/api/models/integration';
import { routes } from '../../app/routing/routes';
import { Panel } from '../../shared/ui/primitives';
import { UI_MESSAGES } from '../../shared/constants/ui.constants';
import { VscodeIcon } from '../../shared/ui/icons';

/** localStorage key for onboarding state. */
const STORAGE_KEY = 'kb-onboarding-checklist';

type OnboardingStorage = {
  dismissed: boolean;
  dismissedAt: string | null;
  showLaterAt: string | null;
};

function loadStorage(): OnboardingStorage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { dismissed: false, dismissedAt: null, showLaterAt: null };
    return JSON.parse(raw) as OnboardingStorage;
  } catch {
    return { dismissed: false, dismissedAt: null, showLaterAt: null };
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
  route: string;
  provider?: string;
  icon: React.ReactNode;
};

const CHECKLIST_ITEMS: ChecklistItemDef[] = [
  {
    id: 'github',
    label: 'Connect GitHub',
    description: 'Automatically create projects by selecting your repositories.',
    priority: true,
    route: routes.integrations,
    provider: 'github-app',
    icon: '⌥',
  },
  {
    id: 'github-push',
    label: 'Make first push',
    description: 'Push code to your linked repository to trigger your first review.',
    priority: true,
    route: routes.projects,
    icon: '↑',
  },
  {
    id: 'vscode-extension',
    label: 'Install VS Code Extension',
    description: 'Download the Kote extension to sync local files and AI history.',
    priority: true,
    route: routes.profile,
    icon: <VscodeIcon style={{ width: '16px', height: '16px', display: 'block' }} />,
  },
  {
    id: 'vscode-sync-chat',
    label: 'Sync your First AI chat',
    description: 'Save a AI session from VS Code to your Kote.',
    priority: true,
    route: routes.home,
    icon: '⚡',
  },
  {
    id: 'whatsapp',
    label: 'Connect WhatsApp',
    description: 'Capture notes and knowledge via WhatsApp messages.',
    priority: true,
    route: routes.integrations,
    provider: 'whatsapp',
    icon: '💬',
  },
  {
    id: 'ask-ai',
    label: 'Test Ask AI',
    description: 'Try asking questions about your Kote.',
    priority: false,
    route: routes.search,
    icon: '✦',
  },
  {
    id: 'project-brief',
    label: 'Test Project Brief',
    description: 'Generate a project brief to summarize project documentation.',
    priority: false,
    route: routes.search,
    icon: '📄',
  },
  {
    id: 'reminder',
    label: 'Set up a reminder',
    description: 'Schedule reminders via WhatsApp to stay on top of tasks.',
    priority: false,
    route: routes.reminders,
    icon: '🔔',
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
): Set<string> {
  const completed = new Set<string>();

  if (isIntegrationConnected(integrations, 'github-app')
    && dashboard.projects.some((p) => p.repositories.length > 0)) {
    completed.add('github');
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
    if (item.id === 'github-push' && !githubConnected) return false;
    if (item.id === 'vscode-sync-chat' && !vscodeInstalled) return false;
    if (item.id === 'ask-ai' && totalNotes < 3) return false;
    if (item.id === 'project-brief' && totalNotes < 3) return false;
    if (item.id === 'reminder' && !whatsappConnected) return false;
    return true;
  });
}

export function OnboardingChecklist({
  dashboard,
  workspaceSlug,
}: {
  dashboard: Dashboard;
  workspaceSlug: string;
}) {
  const [storage, setStorage] = useState(loadStorage);
  const [vscodeConfirmed, setVscodeConfirmed] = useState(() => {
    try {
      return localStorage.getItem('kb-vscode-installed') === 'true';
    } catch {
      return false;
    }
  });

  const integrationsQuery = useQuery({
    queryKey: ['integrations', workspaceSlug],
    queryFn: () => fetchIntegrations(workspaceSlug),
    enabled: Boolean(workspaceSlug),
  });

  const integrations = integrationsQuery.data?.integrations ?? [];

  const totalSyncedChats = dashboard.home.metrics.find((m) => m.id === 'total-synced-chats')?.value ?? 0;
  const vscodeInstalled = vscodeConfirmed || totalSyncedChats > 0;

  const completed = useMemo(
    () => getCompletedItems(integrations, dashboard, vscodeInstalled),
    [integrations, dashboard, vscodeInstalled],
  );

  const visibleItems = useMemo(
    () => getVisibleItems(integrations, dashboard, vscodeInstalled),
    [integrations, dashboard, vscodeInstalled],
  );

  const completedCount = visibleItems.filter((item) => completed.has(item.id)).length;
  const allDone = completedCount === visibleItems.length && visibleItems.length > 0;

  // Auto-hide after 7 days from first dismissal.
  useEffect(() => {
    if (!storage.dismissedAt) return;
    const dismissedDate = new Date(storage.dismissedAt);
    const daysSince = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince >= AUTO_HIDE_DAYS && !storage.dismissed) {
      const next = { ...storage, dismissed: true };
      setStorage(next);
      saveStorage(next);
    }
  }, [storage]);

  // Determine visibility.
  const isHiddenByShowLater = storage.showLaterAt
    ? new Date(storage.showLaterAt).getTime() > Date.now()
    : false;

  if (storage.dismissed || allDone || isHiddenByShowLater) return null;
  if (integrationsQuery.isLoading) return null;

  function handleDismiss() {
    const next: OnboardingStorage = {
      dismissed: true,
      dismissedAt: new Date().toISOString(),
      showLaterAt: null,
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
    };
    setStorage(next);
    saveStorage(next);
  }

  const progressPercent = visibleItems.length > 0
    ? Math.round((completedCount / visibleItems.length) * 100)
    : 0;

  return (
    <Panel className="onboarding-checklist" id="onboarding-checklist" aria-label={`${UI_MESSAGES.GETTING_STARTED} checklist`}>
      <div className="onboarding-checklist-head">
        <div>
          <h2>{UI_MESSAGES.GETTING_STARTED}</h2>
          <p className="meta">Complete these steps to unlock the full potential of your workspace.</p>
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
            <span className="onboarding-ring-label">{completedCount}/{visibleItems.length}</span>
          </div>
        </div>
      </div>

      <div className="onboarding-checklist-items">
        {visibleItems.map((item) => {
          const done = completed.has(item.id);
          return (
            <Link
              className={`onboarding-item ${done ? 'done' : ''} ${item.priority ? 'priority' : ''}`}
              key={item.id}
              to={item.route}
              id={`onboarding-item-${item.id}`}
            >
              <span className={`onboarding-item-check ${done ? 'checked' : ''}`} aria-hidden="true">
                {done ? '✓' : item.icon}
              </span>
              <div className="onboarding-item-copy">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
                {item.id === 'vscode-extension' && !done && (
                  <button
                    className="onboarding-reminder-test-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        localStorage.setItem('kb-vscode-installed', 'true');
                      } catch {
                        // ignore
                      }
                      setVscodeConfirmed(true);
                    }}
                  >
                    Confirm installation
                  </button>
                )}
                {item.id === 'reminder' && !done && (
                  <button
                    className="onboarding-reminder-test-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const message = "Remind me to check the onboarding checklist in 1 minute";
                      const number = import.meta.env.VITE_WHATSAPP_NUMBER || '5531992504889';
                      const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Send test reminder (1 min)
                  </button>
                )}
              </div>
              {item.priority && !done ? (
                <span className="onboarding-item-badge">Priority</span>
              ) : null}
              <span className="onboarding-item-arrow" aria-hidden="true">→</span>
            </Link>
          );
        })}
      </div>

      <div className="onboarding-checklist-foot">
        <button className="onboarding-dismiss" type="button" onClick={handleShowLater}>
          Show me later
        </button>
        <button className="onboarding-dismiss muted" type="button" onClick={handleDismiss}>
          Dismiss
        </button>
      </div>
    </Panel>
  );
}
