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
  const profileMenuRef = useRef<HTMLDivElement>(null);

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
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
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
    <div className="app-shell flex h-screen w-screen overflow-hidden bg-background text-text font-sans antialiased">
      <OfflineBanner />
      {showQuotaWarningDot && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-b border-amber-500/20 px-4 py-2 text-xs flex items-center justify-center gap-2" role="alert" aria-live="polite">
          <span>⚠️</span>
          <span>
            You are approaching your monthly limit.{' '}
            <Link to="/profile" className="font-semibold underline hover:text-amber-700 dark:hover:text-amber-300">See quota usage</Link>
            {' · '}
            <Link to="/automations/subscription" className="font-semibold underline hover:text-amber-700 dark:hover:text-amber-300">Upgrade your plan</Link>
          </span>
        </div>
      )}
      <button
        aria-label={UI_MESSAGES.CLOSE_NAVIGATION}
        aria-hidden={!isMobileNavOpen}
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300 cursor-pointer ${isMobileNavOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMobileNavOpen(false)}
        tabIndex={isMobileNavOpen ? 0 : -1}
        type="button"
      />
      <aside className={`sidebar fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-panel border-r border-line/40 transition-transform duration-300 lg:translate-x-0 lg:static lg:h-screen lg:z-auto ${isMobileNavOpen ? 'translate-x-0 open' : '-translate-x-full'}`} aria-label={UI_MESSAGES.VAULT_NAVIGATION} id="app-sidebar">
        <Link className="brand flex items-center gap-3 px-6 py-5 border-b border-line/30 hover:opacity-90 transition-opacity" to={routes.home} aria-label={UI_MESSAGES.GO_TO_HOME}>
          <BrandMark />
          <div className="flex flex-col">
            <strong className="text-sm font-semibold tracking-tight text-text-strong">{UI_MESSAGES.KNOWLEDGE_VAULT}</strong>
            <span className="text-[10px] uppercase tracking-wider text-muted font-medium mt-0.5">{UI_MESSAGES.DEVELOPER_KNOWLEDGE_BASE}</span>
          </div>
        </Link>
        <nav className="main-nav flex-1 px-4 py-6 space-y-1 overflow-y-auto" aria-label={UI_MESSAGES.MAIN_SECTIONS}>
          {navItems.map((item) => (
            <NavLink
              className={({ isActive }) => `nav-item flex items-center px-4 py-2.5 text-sm font-medium rounded-lg text-text hover:bg-line/20 hover:text-text-strong transition-all duration-200 ${isActive || view === item.view ? 'bg-line/45 text-text-strong font-semibold shadow-sm border border-line/10 active' : ''}`}
              end={item.path === routes.home}
              key={item.view}
              onClick={() => setIsMobileNavOpen(false)}
              to={item.path}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <section className="px-4 py-4 border-t border-line/30">
          <div className="px-4 text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">{UI_MESSAGES.WORKSPACE}</div>
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-line/20 border border-line/35" aria-label={`${UI_MESSAGES.CURRENT_WORKSPACE} ${activeWorkspace.workspaceSlug}`} role="status">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="flex flex-col text-left">
              <strong className="text-xs font-semibold text-text-strong">{activeWorkspace.displayName}</strong>
              <small className="text-[10px] text-muted font-medium mt-0.5">{activeWorkspace.workspaceSlug}</small>
            </span>
          </div>
        </section>
        <section className="px-4 py-4 border-t border-line/30">
          <div className="px-4 text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">{UI_MESSAGES.PROJECTS}</div>
          <div className="space-y-1 max-h-[220px] overflow-y-auto">
            {dashboard.projects.map((project) => (
              <div className="flex items-center justify-between group rounded-lg hover:bg-line/20 transition-colors" key={project.projectSlug}>
                <button
                  className={`flex items-center flex-1 gap-2.5 px-4 py-2 text-xs font-medium text-left text-text hover:text-text-strong truncate cursor-pointer ${project.projectSlug === pageContext.selectedProject ? 'text-text-strong font-semibold bg-line/25' : ''}`}
                  type="button"
                  onClick={() => {
                    pageContext.openProject(project.projectSlug);
                    setIsMobileNavOpen(false);
                  }}
                >
                  <span className="flex items-center justify-center w-5 h-5 rounded bg-line/40 text-[10px] font-semibold text-text-strong">P</span>
                  <span className="truncate">{project.displayName}</span>
                  {project.activitySparkline && (
                    <div className="project-sparkline" style={{ width: '40px', height: '16px', marginLeft: 'auto', marginRight: '4px', flexShrink: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={project.activitySparkline}>
                          <Line
                            type="monotone"
                            dataKey="count"
                            stroke={project.projectSlug === pageContext.selectedProject ? 'var(--text-strong)' : 'var(--muted)'}
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
                  className={`p-2 text-muted hover:text-amber-500 focus:opacity-100 transition-all cursor-pointer ${project.favorite ? 'text-amber-500 opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFavoriteMutation.mutate({ slug: project.projectSlug, favorite: !project.favorite });
                  }}
                  type="button"
                >
                  <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill={project.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </section>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-background">
        <header className="flex items-center justify-between h-16 px-6 border-b border-line/40 bg-panel/85 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button
              aria-label={UI_MESSAGES.MENU}
              aria-controls="app-sidebar"
              aria-expanded={isMobileNavOpen}
              className="lg:hidden p-2 -ml-2 rounded-lg text-text hover:bg-line/35 transition-colors cursor-pointer"
              onClick={() => setIsMobileNavOpen((current) => !current)}
              type="button"
            >
              <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
              </svg>
            </button>
            <div className="flex flex-col text-left" aria-live="polite">
              <strong className="text-sm font-semibold tracking-tight text-text-strong">{topbarTitle}</strong>
              <span className="text-[10px] text-muted mt-0.5">{activeWorkspace.displayName}</span>
            </div>
          </div>
          <div className="relative max-w-md w-full mx-4 hidden md:block" ref={commandBarRef}>
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line/60 bg-background/50 focus-within:border-cyan-500/50 focus-within:ring-2 focus-within:ring-cyan-500/10 transition-all w-full cursor-text">
              <span className="text-xs font-semibold text-muted">&gt;_</span>
              <input
                type="search"
                className="bg-transparent border-0 outline-none text-sm placeholder:text-muted/70 text-text w-full py-0.5"
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
                className="p-1 text-muted hover:text-cyan-500 transition-colors rounded hover:bg-line/30 cursor-pointer"
                onClick={() => navigate(`${routes.search}?focus=input`)}
                title={UI_MESSAGES.ASK_AI_SEMANTIC_SEARCH}
                type="button"
              >
                <AskAiIcon className="w-4 h-4" />
              </button>
            </label>
            {isPopoverOpen && searchValue.trim() && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-panel/95 border border-line/50 rounded-xl shadow-lg dark:shadow-card-dark overflow-hidden py-1 z-50 max-h-[320px] overflow-y-auto backdrop-blur-md" role="listbox">
                {isSearching ? (
                  <div className="px-4 py-3 text-xs text-muted text-center">{UI_MESSAGES.SEARCHING}</div>
                ) : searchQuery.data?.matches?.length ? (
                  searchQuery.data.matches.map((match, index) => (
                    <button
                      key={match.id}
                      className={`flex items-center justify-between w-full px-4 py-2.5 text-left hover:bg-line/25 transition-colors focus:bg-line/25 outline-none cursor-pointer ${index === focusedIndex ? 'bg-line/30' : ''}`}
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
                      <div className="flex flex-col min-w-0 pr-4">
                        <span className="text-xs font-semibold text-text-strong truncate">{match.title}</span>
                        {match.path ? <span className="text-[10px] text-muted truncate mt-0.5">{match.path}</span> : null}
                      </div>
                      <div className="flex-shrink-0">
                        <span className="text-[9px] font-semibold px-2 py-0.5 rounded bg-line/50 text-text-soft border border-line/20">{match.project}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-3 text-xs text-muted text-center">{UI_MESSAGES.NO_NOTES_FOUND}</div>
                )}
              </div>
            )}
          </div>
          <div className="topbar-meta flex items-center gap-4">
            <div className="relative" ref={profileMenuRef}>
              <button
                aria-expanded={isProfileMenuOpen}
                aria-haspopup="menu"
                aria-label={UI_MESSAGES.USER_MENU}
                className={`topbar-link topbar-icon flex items-center justify-center p-1 rounded-full border border-transparent hover:border-line/45 transition-colors cursor-pointer relative ${view === 'profile' || view === 'integrations' || view === 'subscription' ? 'border-line/45 bg-line/20 active' : ''}`}
                onClick={() => setIsProfileMenuOpen((current) => !current)}
                title={UI_MESSAGES.USER_MENU}
                type="button"
              >
                <UserAvatar
                  avatarUrl={currentUser?.avatarUrl}
                  className="w-7 h-7 rounded-full"
                  displayName={currentUser?.displayName}
                  email={currentUser?.email}
                />
                {showQuotaWarningDot && (
                  <span
                    title="AI credit quota is running low"
                    className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-panel"
                  />
                )}
              </button>
              {isProfileMenuOpen ? (
                <div className="absolute right-0 mt-2 w-64 bg-panel/95 border border-line/50 rounded-xl shadow-lg dark:shadow-card-dark overflow-hidden p-1.5 z-50 backdrop-blur-md" role="menu">
                  <div className="flex items-center gap-3 p-3 border-b border-line/30 mb-1">
                    <UserAvatar
                      avatarUrl={currentUser?.avatarUrl}
                      className="w-9 h-9 rounded-full"
                      displayName={currentUser?.displayName}
                      email={currentUser?.email}
                    />
                    <div className="flex flex-col text-left min-w-0">
                      <strong className="text-xs font-semibold text-text-strong truncate">{currentUser?.displayName || UI_MESSAGES.LOADING_USER}</strong>
                      <span className="text-[10px] text-muted truncate">{currentUser?.email || UI_MESSAGES.LOADING_EMAIL}</span>
                    </div>
                  </div>
                  <Link className="flex w-full items-center px-3 py-2 text-xs font-medium rounded-lg text-text hover:bg-line/20 hover:text-text-strong transition-all" role="menuitem" to={routes.profile}>
                    {UI_MESSAGES.MY_PROFILE}
                  </Link>
                  <Link className="flex w-full items-center px-3 py-2 text-xs font-medium rounded-lg text-text hover:bg-line/20 hover:text-text-strong transition-all" role="menuitem" to={routes.integrations}>
                    {UI_MESSAGES.INTEGRATIONS}
                  </Link>
                  <Link className="flex w-full items-center px-3 py-2 text-xs font-medium rounded-lg text-text hover:bg-line/20 hover:text-text-strong transition-all" role="menuitem" to={routes.subscription}>
                    Subscription
                  </Link>
                  {quotaStatus && (
                    <div className="px-3 py-2 border-t border-line/30 my-1 pt-3">
                      <QuotaUsageWidget status={quotaStatus} compact aiOnly hideTitle={false} />
                    </div>
                  )}
                  <Link className="flex w-full items-center px-3 py-2 text-xs font-medium rounded-lg text-text hover:bg-line/20 hover:text-text-strong transition-all" role="menuitem" to={routes.automations}>
                    Automations
                  </Link>
                  <Link className="flex w-full items-center px-3 py-2 text-xs font-medium rounded-lg text-text hover:bg-line/20 hover:text-text-strong transition-all" role="menuitem" to={routes.help}>
                    {UI_MESSAGES.DOCUMENTATION}
                  </Link>
                </div>
              ) : null}
            </div>
            <ThemeToggle className="p-2 rounded-lg text-text hover:bg-line/30 transition-colors cursor-pointer" />
            <button
              className="text-xs font-medium text-text-soft hover:text-text-strong px-3 py-1.5 rounded-lg border border-line/50 hover:bg-line/20 transition-all cursor-pointer"
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
        <section className="flex-1 overflow-y-auto px-6 py-6 space-y-6" aria-live="polite">
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
