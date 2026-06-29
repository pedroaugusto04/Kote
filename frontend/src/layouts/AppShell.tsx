import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import type { PageContext } from '../app/page-context';
import { navItems, routes, type View } from '../app/routing/routes';
import { ApiClientError, deleteNote, fetchCurrentUser, fetchDashboard, fetchNote, fetchProjectFolders, logout, runQuery, setProjectFavorite } from '../shared/api/client';
import { fetchSubscriptionStatus } from '../shared/api/billing';
import { QuotaUsageWidget } from '../features/quota/QuotaUsageWidget';
import { hasQuotaWarning } from '../features/quota/quota.utils';
import type { NoteSummary } from '../shared/api/models/note';
import { ensureNoteDetail, getCachedNoteDetail, invalidateNoteRelatedQueries, noteDetailQueryOptions } from '../shared/api/note-query';
import { HomePage } from '../pages/home/HomePage';
import { ProjectsPage } from '../pages/projects/ProjectsPage';
import { RemindersPage } from '../pages/reminders/RemindersPage';
import { SearchPage } from '../pages/search/SearchPage';
import { VaultPage } from '../pages/vault/VaultPage';
import { LandingPage } from '../pages/landing/LandingPage';
import { GlobalLoadingOverlay } from '../shared/ui/GlobalLoadingOverlay';
import { AskAiIcon } from '../widgets/ask/AskAiIcon';

const IntegrationsPage = lazy(() => import('../pages/integrations/IntegrationsPage').then(m => ({ default: m.IntegrationsPage })));
const SubscriptionPage = lazy(() => import('../pages/billing/SubscriptionPage').then(m => ({ default: m.SubscriptionPage })));
const ProjectKnowledgeMapPage = lazy(() => import('../features/projects/knowledge-map/ProjectKnowledgeMapPage').then(m => ({ default: m.ProjectKnowledgeMapPage })));
const ProfilePage = lazy(() => import('../pages/profile/ProfilePage').then(m => ({ default: m.ProfilePage })));
const SetupPage = lazy(() => import('../pages/setup/SetupPage').then(m => ({ default: m.SetupPage })));
const AuthPage = lazy(() => import('../pages/auth/AuthPage').then(m => ({ default: m.AuthPage })));
const HelpPage = lazy(() => import('../pages/help/HelpPage').then(m => ({ default: m.HelpPage })));
const AutomationsPage = lazy(() => import('../pages/automations/AutomationsPage').then((m: any) => ({ default: m?.default ?? m.AutomationsPage })));
import { flattenFolders } from '../features/projects/projects.helpers';
import { ProjectNoteModal } from '../features/projects/modals/ProjectNoteModal';
import type { ConfirmState, NoteModalState } from '../features/projects/projects.types';
import { notifyGeneralFormError } from '../shared/forms/errors';
import { ConfirmationModal } from '../shared/ui/confirmation-modal';
import { QuotaExceededModal } from '../shared/ui/QuotaExceededModal';
import { QUERY_KEYS } from '../shared/constants/query-keys.constants';
import { UI_MESSAGES } from '../shared/constants/ui.constants';
import { KEYBOARD_KEYS } from '../shared/constants/keyboard.constants';
import { notifySuccess } from '../shared/ui/notifications';
import { UserAvatar } from '../shared/ui/user-avatar';
import { BrandMark } from '../shared/ui/brand-mark';
import { ThemeToggle } from '../shared/ui/theme-toggle';
import { useGlobalLoading } from '../app/global-loading';
import { useDebouncedValue } from '../shared/ui/use-debounced-value';
import { OfflineBanner } from '../shared/ui/offline-banner';
import { Breadcrumbs } from '../shared/ui/Breadcrumbs';
import { Line, LineChart, ResponsiveContainer } from 'recharts';


function activeView(pathname: string): View {
  if (pathname.startsWith(routes.map)) return 'map';
  if (pathname.startsWith(routes.projects)) return 'projects';
  if (pathname.startsWith(routes.vault)) return 'note';
  if (pathname.startsWith(routes.search)) return 'search';
  if (pathname.startsWith(routes.reminders)) return 'reminders';
  if (pathname.startsWith(routes.profile)) return 'profile';
  if (pathname.startsWith(routes.integrations)) return 'integrations';
  if (pathname.startsWith(routes.subscription)) return 'subscription';
  if (pathname.startsWith(routes.automations)) return 'automations';
  if (pathname.startsWith(routes.help)) return 'help';
  return 'home';
}

function routeParam(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) return '';
  const value = pathname.slice(prefix.length).split('/')[0] || '';
  return value ? decodeURIComponent(value) : '';
}

export function AppShell() {
  const queryClient = useQueryClient();
  const globalLoading = useGlobalLoading();
  const dashboardQuery = useQuery({
    queryKey: QUERY_KEYS.DASHBOARD,
    queryFn: fetchDashboard,
    retry: (failureCount, error) => {
      if (error instanceof ApiClientError && error.status === 401) return false;
      return failureCount < 3;
    },
  });
  const dashboard = dashboardQuery.data;
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedProject, setSelectedProjectState] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState('');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [noteModal, setNoteModal] = useState<NoteModalState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [quotaExceededError, setQuotaExceededError] = useState<ApiClientError | null>(null);

  const [searchValue, setSearchValue] = useState('');
  const debouncedSearchValue = useDebouncedValue(searchValue, 300);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const commandBarRef = useRef<HTMLDivElement>(null);

  const view = activeView(location.pathname);
  const routeProject = routeParam(location.pathname, `${routes.projects}/`);
  const isProjectsRoot = location.pathname === routes.projects;
  const routeNoteId = routeParam(location.pathname, `${routes.vault}/`);
  const activeWorkspace = dashboard?.workspaces[0] || null;
  const workspaceSlug = activeWorkspace?.workspaceSlug || '';
  const isSetupRoute = location.pathname.startsWith(routes.setup);

  const searchQuery = useQuery({
    queryKey: QUERY_KEYS.GLOBAL_SEARCH(debouncedSearchValue, workspaceSlug),
    queryFn: () => runQuery({
      query: debouncedSearchValue,
      workspaceSlug,
      limit: 5,
    }),
    enabled: Boolean(debouncedSearchValue.trim()),
  });
  const isSearching = searchQuery.isLoading || searchQuery.isFetching || (searchValue.trim() !== debouncedSearchValue.trim());
  const activeNavItem = navItems.find((item) => item.view === view);
  const topbarTitle = view === 'note'
    ? UI_MESSAGES.NOTE_DETAILS
    : view === 'profile'
      ? UI_MESSAGES.PROFILE
      : view === 'integrations'
        ? UI_MESSAGES.INTEGRATIONS
        : view === 'help'
          ? UI_MESSAGES.DOCUMENTATION
          : activeNavItem?.label || UI_MESSAGES.HOME;
  const routeNoteQuery = useQuery(noteDetailQueryOptions(routeNoteId));
  const cachedRouteNote = getCachedNoteDetail(queryClient, routeNoteId);
  const activeRouteNote = routeNoteQuery.data || cachedRouteNote;
  const shouldBlockNoteRoute = Boolean(routeNoteId) && routeNoteQuery.isLoading && !activeRouteNote;
  const isUnauthorized = dashboardQuery.error instanceof ApiClientError && dashboardQuery.error.status === 401;
  const currentUserQuery = useQuery({
    queryKey: QUERY_KEYS.AUTH.ME,
    queryFn: fetchCurrentUser,
    enabled: Boolean(dashboard && activeWorkspace && !isSetupRoute),
  });
  const currentUser = currentUserQuery.data?.user;

  // Quota status — loaded lazily, refreshed every 60s, used for compact sidebar widget
  const quotaStatusQuery = useQuery({
    queryKey: ['billing', 'status'],
    queryFn: fetchSubscriptionStatus,
    staleTime: 60_000,
    enabled: Boolean(dashboard && activeWorkspace && !isSetupRoute),
  });
  const quotaStatus = quotaStatusQuery.data;
  const showQuotaWarningDot = quotaStatus ? hasQuotaWarning(quotaStatus) : false;

  useLayoutEffect(() => {
    if (dashboardQuery.isLoading && !dashboardQuery.data) {
      globalLoading.startImmediate();
      return () => globalLoading.stop();
    }
    return undefined;
  }, [dashboardQuery.data, dashboardQuery.isLoading, globalLoading]);

  useLayoutEffect(() => {
    if (shouldBlockNoteRoute) {
      globalLoading.startImmediate();
      return () => globalLoading.stop();
    }
    return undefined;
  }, [globalLoading, shouldBlockNoteRoute]);

  useEffect(() => {
    setIsMobileNavOpen(false);
    setIsProfileMenuOpen(false);
    setIsPopoverOpen(false);
    setSearchValue('');
    setFocusedIndex(-1);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (commandBarRef.current && !commandBarRef.current.contains(event.target as Node)) {
        setIsPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleQuotaExceeded = (event: Event) => {
      const customEvent = event as CustomEvent<ApiClientError>;
      setQuotaExceededError(customEvent.detail);
    };

    window.addEventListener('quota-exceeded', handleQuotaExceeded);
    return () => {
      window.removeEventListener('quota-exceeded', handleQuotaExceeded);
    };
  }, []);

  useEffect(() => {
    if (!isProfileMenuOpen) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEYBOARD_KEYS.ESCAPE) setIsProfileMenuOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isProfileMenuOpen]);

  const noteFoldersQuery = useQuery({
    queryKey: QUERY_KEYS.PROJECTS.FOLDERS(noteModal?.mode === 'edit' ? noteModal.note.project : ''),
    queryFn: () => fetchProjectFolders(noteModal?.mode === 'edit' ? noteModal.note.project : ''),
    enabled: noteModal?.mode === 'edit',
  });
  const noteModalFolders = useMemo(
    () => flattenFolders(noteFoldersQuery.data?.folders || []),
    [noteFoldersQuery.data?.folders],
  );
  const loadNoteMutation = useMutation({
    mutationFn: (id: string) => globalLoading.trackPromise(fetchNote(id)),
    onSuccess: (note) => setNoteModal({ mode: 'edit', note }),
    onError: (error) => notifyGeneralFormError(error, UI_MESSAGES.COULD_NOT_LOAD_NOTE_FOR_EDITING),
  });
  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => globalLoading.trackPromise(deleteNote(id)),
    onSuccess: async (_, noteId) => {
      setConfirmState(null);
      setSelectedNoteId((current) => (current === noteId ? '' : current));
      if (routeNoteId === noteId) {
        navigate(routes.vault);
      }
      notifySuccess(UI_MESSAGES.NOTE_DELETED);
      await refreshDashboard(queryClient);
    },
    onError: (error) => notifyGeneralFormError(error, UI_MESSAGES.COULD_NOT_DELETE_NOTE),
  });
  const toggleFavoriteMutation = useMutation({
    mutationFn: ({ slug, favorite }: { slug: string; favorite: boolean }) =>
      setProjectFavorite(slug, favorite),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DASHBOARD }),
  });

  useEffect(() => {
    if (!isMobileNavOpen) return undefined;

    const originalOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEYBOARD_KEYS.ESCAPE) setIsMobileNavOpen(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isMobileNavOpen]);

  const pageContext = useMemo<PageContext | null>(() => {
    if (!dashboard) return null;

    const currentProject = isProjectsRoot ? '' : routeProject || activeRouteNote?.project || selectedProject || dashboard.projects[0]?.projectSlug || '';
    const currentNote = routeNoteId || selectedNoteId || '';

    return {
      dashboard,
      selectedProject: currentProject,
      selectedNoteId: currentNote,
      setSelectedProject: (slug: string) => {
        setSelectedProjectState(slug);
      },
      openProject: (slug: string) => {
        setSelectedProjectState(slug);
        navigate(slug ? routes.project(slug) : routes.projects);
      },
      openNote: (id: string) => {
        void globalLoading.trackPromise(
          ensureNoteDetail(queryClient, id),
        ).then((note) => {
          setSelectedProjectState(note.project);
          setSelectedNoteId(id);
          navigate(routes.note(id));
        }).catch((error) => {
          notifyGeneralFormError(error, UI_MESSAGES.COULD_NOT_OPEN_NOTE);
        });
      },
      editNote: (noteId: string) => {
        loadNoteMutation.mutate(noteId);
      },
      createNote: (projectSlug?: string) => {
        const slug = projectSlug || currentProject || dashboard.projects[0]?.projectSlug || UI_MESSAGES.DEFAULT_PROJECT_SLUG;
        setNoteModal({ mode: 'create', projectSlug: slug });
      },
      deleteNote: (note: Pick<NoteSummary, 'id' | 'title'>) => {
        setConfirmState({ kind: 'note', note: { ...note } as NoteSummary });
      },
    };
  }, [activeRouteNote?.project, dashboard, globalLoading, isProjectsRoot, navigate, queryClient, routeNoteId, routeProject, selectedNoteId, selectedProject, view]);

  if (isUnauthorized) {
    return (
      <Suspense fallback={<GlobalLoadingOverlay />}>
        <Routes>
          <Route path={routes.home} element={<LandingPage />} />
          <Route path={routes.auth} element={<AuthPage onAuthenticated={() => dashboardQuery.refetch()} />} />
          <Route path="*" element={<Navigate replace to={routes.auth} />} />
        </Routes>
      </Suspense>
    );
  }

  if (!dashboard || !pageContext) return null;
  if (isSetupRoute) {
    return (
      <Suspense fallback={<GlobalLoadingOverlay />}>
        <SetupPage dashboard={dashboard} refetchDashboard={() => dashboardQuery.refetch()} />
      </Suspense>
    );
  }
  if (!activeWorkspace) return <Navigate replace to={routes.setup} />;
  if (location.pathname === routes.auth) return <Navigate replace to={routes.home} />;

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const matches = searchQuery.data?.matches || [];
    if (event.key === KEYBOARD_KEYS.ARROW_DOWN) {
      event.preventDefault();
      if (!isPopoverOpen) {
        setIsPopoverOpen(true);
        return;
      }
      setFocusedIndex((prev) => (prev + 1 < matches.length ? prev + 1 : 0));
    } else if (event.key === KEYBOARD_KEYS.ARROW_UP) {
      event.preventDefault();
      if (!isPopoverOpen) {
        setIsPopoverOpen(true);
        return;
      }
      setFocusedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : matches.length - 1));
    } else if (event.key === KEYBOARD_KEYS.ENTER) {
      if (isPopoverOpen && focusedIndex >= 0 && focusedIndex < matches.length) {
        event.preventDefault();
        const selectedMatch = matches[focusedIndex];
        pageContext.openNote(selectedMatch.id);
        setSearchValue('');
        setIsPopoverOpen(false);
        setFocusedIndex(-1);
      } else {
        const q = searchValue.trim();
        if (q) {
          event.preventDefault();
          navigate(`${routes.search}?q=${encodeURIComponent(q)}`);
          setIsPopoverOpen(false);
          setSearchValue('');
          setFocusedIndex(-1);
        }
      }
    } else if (event.key === KEYBOARD_KEYS.ESCAPE) {
      event.preventDefault();
      setIsPopoverOpen(false);
      setFocusedIndex(-1);
      event.currentTarget.blur();
    }
  };

  return (
    <div className="app-shell">
      <OfflineBanner />
      {showQuotaWarningDot && (
        <div className="quota-warning-banner" role="alert" aria-live="polite">
          <span style={{ fontSize: '14px' }}>⚠️</span>
          <span style={{ fontSize: '12px' }}>
            You are approaching your monthly limit.{' '}
            <Link to="/profile" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600 }}>See quota usage</Link>
            {' · '}
            <Link to="/automations/subscription" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600 }}>Upgrade your plan</Link>
          </span>
        </div>
      )}
      <button
        aria-label={UI_MESSAGES.CLOSE_NAVIGATION}
        aria-hidden={!isMobileNavOpen}
        className={`mobile-nav-backdrop ${isMobileNavOpen ? 'visible' : ''}`}
        onClick={() => setIsMobileNavOpen(false)}
        tabIndex={isMobileNavOpen ? 0 : -1}
        type="button"
      />
      <aside className={`sidebar ${isMobileNavOpen ? 'open' : ''}`} aria-label={UI_MESSAGES.VAULT_NAVIGATION} id="app-sidebar">
        <Link className="brand" to={routes.home} aria-label={UI_MESSAGES.GO_TO_HOME}>
          <BrandMark />
          <div>
            <strong>{UI_MESSAGES.KNOWLEDGE_VAULT}</strong>
            <span>{UI_MESSAGES.DEVELOPER_KNOWLEDGE_BASE}</span>
          </div>
        </Link>
        <nav className="main-nav" aria-label={UI_MESSAGES.MAIN_SECTIONS}>
          {navItems.map((item) => (
            <NavLink
              className={({ isActive }) => `nav-item ${isActive || view === item.view ? 'active' : ''}`}
              end={item.path === routes.home}
              key={item.view}
              onClick={() => setIsMobileNavOpen(false)}
              to={item.path}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <section className="sidebar-section">
          <div className="section-label">{UI_MESSAGES.WORKSPACE}</div>
          <div className="workspace-pill workspace-pill-static" aria-label={`${UI_MESSAGES.CURRENT_WORKSPACE} ${activeWorkspace.workspaceSlug}`} role="status">
            <span className="status-dot" />
            <span className="workspace-pill-copy">
              <strong>{activeWorkspace.displayName}</strong>
              <small>{activeWorkspace.workspaceSlug}</small>
            </span>
          </div>
        </section>
        <section className="sidebar-section">
          <div className="section-label">{UI_MESSAGES.PROJECTS}</div>
          <div className="tree">
            {dashboard.projects.map((project) => (
              <div className="tree-item-row" key={project.projectSlug}>
                <button
                  className={`tree-item ${project.projectSlug === pageContext.selectedProject ? 'active' : ''}`}
                  type="button"
                  onClick={() => {
                    pageContext.openProject(project.projectSlug);
                    setIsMobileNavOpen(false);
                  }}
                >
                  <span className="file-icon">P</span>
                  <span>{project.displayName}</span>
                  {project.activitySparkline && (
                    <div className="project-sparkline" style={{ width: '40px', height: '16px', marginLeft: 'auto', marginRight: '4px', flexShrink: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={project.activitySparkline}>
                          <Line
                            type="monotone"
                            dataKey="count"
                            stroke={project.projectSlug === pageContext.selectedProject ? 'var(--text)' : 'var(--muted)'}
                            strokeWidth={1.5}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </button>
                <button
                  aria-label={project.favorite ? UI_MESSAGES.UNSTAR : UI_MESSAGES.STAR}
                  className={`favorite-star ${project.favorite ? 'active' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFavoriteMutation.mutate({ slug: project.projectSlug, favorite: !project.favorite });
                  }}
                  type="button"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill={project.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </section>
      </aside>
      <main className="content">
        <header className="topbar">
          <div className="topbar-leading">
            <button
              aria-label={UI_MESSAGES.MENU}
              aria-controls="app-sidebar"
              aria-expanded={isMobileNavOpen}
              className="mobile-nav-toggle"
              onClick={() => setIsMobileNavOpen((current) => !current)}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
              </svg>
            </button>
            <div className="topbar-context" aria-live="polite">
              <strong>{topbarTitle}</strong>
              <span>{activeWorkspace.displayName}</span>
            </div>
          </div>
          <div className="command-bar-container" ref={commandBarRef}>
            <label className="command-bar">
              <span>&gt;_</span>
              <input
                type="search"
                placeholder={UI_MESSAGES.SEARCH_NOTES_PATHS_OR_TAGS}
                value={searchValue}
                onChange={(event) => {
                  setSearchValue(event.target.value);
                  setIsPopoverOpen(true);
                  setFocusedIndex(-1);
                }}
                onFocus={() => setIsPopoverOpen(true)}
                onKeyDown={handleSearchKeyDown}
              />
              <button
                aria-label={UI_MESSAGES.ASK_AI_SEMANTIC_SEARCH}
                className="ask-ai-shortcut-btn"
                onClick={() => navigate(routes.search)}
                title={UI_MESSAGES.ASK_AI_SEMANTIC_SEARCH}
                type="button"
              >
                <AskAiIcon className="ask-ai-shortcut-icon" />
              </button>
            </label>
            {isPopoverOpen && searchValue.trim() && (
              <div className="command-bar-popover" role="listbox">
                {isSearching ? (
                  <div className="command-bar-popover-status">{UI_MESSAGES.SEARCHING}</div>
                ) : searchQuery.data?.matches?.length ? (
                  searchQuery.data.matches.map((match, index) => (
                    <button
                      key={match.id}
                      className={`command-bar-result-item ${index === focusedIndex ? 'focused' : ''}`}
                      onClick={() => {
                        pageContext.openNote(match.id);
                        setSearchValue('');
                        setIsPopoverOpen(false);
                        setFocusedIndex(-1);
                      }}
                      type="button"
                      role="option"
                      aria-selected={index === focusedIndex}
                    >
                      <div className="result-main">
                        <span className="result-title">{match.title}</span>
                        {match.path ? <span className="result-path">{match.path}</span> : null}
                      </div>
                      <div className="result-meta">
                        <span className="result-project-badge">{match.project}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="command-bar-popover-status">{UI_MESSAGES.NO_NOTES_FOUND}</div>
                )}
              </div>
            )}
          </div>
          <div className="topbar-meta">
            <div className="profile-menu">
              <button
                aria-expanded={isProfileMenuOpen}
                aria-haspopup="menu"
                aria-label={UI_MESSAGES.USER_MENU}
                className={`topbar-link topbar-icon ${view === 'profile' || view === 'integrations' || view === 'subscription' ? 'active' : ''}`}
                onClick={() => setIsProfileMenuOpen((current) => !current)}
                title={UI_MESSAGES.USER_MENU}
                type="button"
                style={{ position: 'relative' }}
              >
                <UserAvatar
                  avatarUrl={currentUser?.avatarUrl}
                  className="topbar-avatar"
                  displayName={currentUser?.displayName}
                  email={currentUser?.email}
                />
                {showQuotaWarningDot && (
                  <span
                    title="AI credit quota is running low"
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'hsl(38, 90%, 52%)',
                      border: '2px solid var(--surface-1)',
                    }}
                  />
                )}
              </button>
              {isProfileMenuOpen ? (
                <div className="profile-menu-popover" role="menu">
                  <div className="profile-menu-user">
                    <UserAvatar
                      avatarUrl={currentUser?.avatarUrl}
                      className="profile-menu-avatar"
                      displayName={currentUser?.displayName}
                      email={currentUser?.email}
                    />
                    <div className="profile-menu-copy">
                      <strong>{currentUser?.displayName || UI_MESSAGES.LOADING_USER}</strong>
                      <span>{currentUser?.email || UI_MESSAGES.LOADING_EMAIL}</span>
                    </div>
                  </div>
                  <Link className="profile-menu-link" role="menuitem" to={routes.profile}>
                    {UI_MESSAGES.MY_PROFILE}
                  </Link>
                  <Link className="profile-menu-link" role="menuitem" to={routes.integrations}>
                    {UI_MESSAGES.INTEGRATIONS}
                  </Link>
                  <Link className="profile-menu-link" role="menuitem" to={routes.subscription}>
                    Subscription
                  </Link>
                  {quotaStatus && (
                    <div style={{ padding: '12px 12px 4px', borderTop: '1px solid var(--border-subtle)', marginTop: 4 }}>
                      <QuotaUsageWidget status={quotaStatus} compact aiOnly hideTitle={false} />
                    </div>
                  )}
                  <Link className="profile-menu-link" role="menuitem" to={routes.automations}>
                    Automations
                  </Link>
                  <Link className="profile-menu-link" role="menuitem" to={routes.help}>
                    {UI_MESSAGES.DOCUMENTATION}
                  </Link>
                </div>
              ) : null}
            </div>
            <ThemeToggle className="topbar-link theme-toggle" />
            <button
              className="topbar-link"
              type="button"
              onClick={() => {
                void globalLoading.trackPromise(logout()).finally(() => {
                  queryClient.clear();
                  dashboardQuery.refetch();
                });
              }}
            >
              {UI_MESSAGES.SIGN_OUT}
            </button>
          </div>
        </header>
        <section className="view" aria-live="polite">
          <Breadcrumbs projects={dashboard.projects} />
          <Suspense fallback={<GlobalLoadingOverlay />}>
            <Routes>
              <Route path="/" element={<HomePage {...pageContext} />} />
              <Route path="/projects" element={<ProjectsPage {...pageContext} />} />
              <Route path="/map" element={<ProjectKnowledgeMapPage dashboard={pageContext.dashboard} openNote={pageContext.openNote} selectedProject={pageContext.selectedProject} />} />
              <Route path="/map/:projectSlug" element={<ProjectKnowledgeMapPage dashboard={pageContext.dashboard} openNote={pageContext.openNote} selectedProject={pageContext.selectedProject} />} />
              <Route path="/projects/:projectSlug" element={<ProjectsPage {...pageContext} />} />
              <Route path="/vault" element={<Navigate replace to={routes.projects} />} />
              <Route path="/vault/:noteId" element={shouldBlockNoteRoute ? null : <VaultPage {...pageContext} />} />
              <Route path="/search" element={<SearchPage {...pageContext} />} />
              <Route path="/reminders" element={<RemindersPage {...pageContext} />} />
              <Route path="/profile" element={<ProfilePage workspace={activeWorkspace} />} />
              <Route path="/automations/integrations" element={<IntegrationsPage workspaceSlug={activeWorkspace.workspaceSlug} />} />
              <Route path="/automations/subscription" element={<SubscriptionPage />} />
              <Route path="/automations" element={<AutomationsPage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="*" element={<HomePage {...pageContext} />} />
            </Routes>
          </Suspense>
        </section>
      </main>
      {noteModal ? (
        <ProjectNoteModal
          folders={noteModal.mode === 'edit' ? noteModalFolders : undefined}
          mode={noteModal.mode}
          note={noteModal.mode === 'edit' ? noteModal.note : undefined}
          onClose={() => setNoteModal(null)}
          onSaved={async (noteId, mode) => {
            setNoteModal(null);
            notifySuccess(mode === 'create' ? UI_MESSAGES.NOTE_CREATED : UI_MESSAGES.NOTE_UPDATED);
            await refreshDashboard(queryClient);
          }}
          projectSlug={noteModal.mode === 'edit' ? noteModal.note.project : noteModal.projectSlug}
          initialFolderId={noteModal.mode === 'edit' ? noteModal.note.folderId || undefined : undefined}
          projects={dashboard.projects}
          workspaceSlug={workspaceSlug}
        />
      ) : null}
      {confirmState?.kind === 'note' ? (
        <ConfirmationModal
          busy={deleteNoteMutation.isPending}
          cancelLabel={UI_MESSAGES.CANCEL}
          confirmLabel={UI_MESSAGES.CONFIRM_DELETION}
          description={`Deleting note ${confirmState.note.title} also removes its linked reminder, when present.`}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => deleteNoteMutation.mutate(confirmState.note.id)}
          title={UI_MESSAGES.DELETE_NOTE}
        />
      ) : null}
      {quotaExceededError ? (
        <QuotaExceededModal
          error={quotaExceededError}
          onClose={() => setQuotaExceededError(null)}
        />
      ) : null}
    </div>
  );
}

async function refreshDashboard(queryClient: ReturnType<typeof useQueryClient>) {
  await invalidateNoteRelatedQueries(queryClient);
}
