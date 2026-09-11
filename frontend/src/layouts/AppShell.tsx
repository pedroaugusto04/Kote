import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import type { PageContext } from '../app/page-context';
import { PageContextProvider } from '../app/page-context-provider';
import { navItems, routes, type View } from '../app/routing/routes';
import { ApiClientError, deleteNote, fetchCurrentUser, fetchDashboard, fetchNote, fetchProjectFolders, logout, runQuery, setProjectFavorite } from '../shared/api/client';
import { fetchSubscriptionStatus } from '../shared/api/billing';
import { hasQuotaWarning } from '../features/quota/quota.utils';
import type { NoteSummary } from '../shared/api/models/note';
import { ensureNoteDetail, getCachedNoteDetail, invalidateNoteRelatedQueries, noteDetailQueryOptions } from '../shared/api/note-query';
import { GlobalLoadingOverlay } from '../shared/ui/GlobalLoadingOverlay';

const IntegrationsPage = lazy(() => import('../pages/integrations/IntegrationsPage').then((m) => ({ default: m.IntegrationsPage })));
const SubscriptionPage = lazy(() => import('../pages/billing/SubscriptionPage').then((m) => ({ default: m.SubscriptionPage })));
const ProjectKnowledgeMapPage = lazy(() => import('../features/projects/knowledge-map/ProjectKnowledgeMapPage').then((m) => ({ default: m.ProjectKnowledgeMapPage })));
const ProfilePage = lazy(() => import('../pages/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const SetupPage = lazy(() => import('../pages/setup/SetupPage').then((m) => ({ default: m.SetupPage })));
const AuthPage = lazy(() => import('../pages/auth/AuthPage').then((m) => ({ default: m.AuthPage })));
const HelpPage = lazy(() => import('../pages/help/HelpPage').then((m) => ({ default: m.HelpPage })));
const AutomationsPage = lazy(() => import('../pages/automations/AutomationsPage').then((m) => ({ default: m.AutomationsPage })));
const HomePage = lazy(() => import('../pages/home/HomePage').then((m) => ({ default: m.HomePage })));
const ProjectsPage = lazy(() => import('../pages/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })));
const RemindersPage = lazy(() => import('../pages/reminders/RemindersPage').then((m) => ({ default: m.RemindersPage })));
const SearchPage = lazy(() => import('../pages/search/SearchPage').then((m) => ({ default: m.SearchPage })));
const VaultPage = lazy(() => import('../pages/vault/VaultPage').then((m) => ({ default: m.VaultPage })));
const LandingPage = lazy(() => import('../pages/landing/LandingPage').then((m) => ({ default: m.LandingPage })));

import { flattenFolders } from '../features/projects/projects.helpers';
import { ProjectNoteModal } from '../features/projects/modals/ProjectNoteModal';
import { ConfirmKind, WorkspaceModalMode, type ConfirmState, type NoteModalState } from '../features/projects/projects.types';
import { notifyGeneralFormError } from '../shared/forms/errors';
import { ConfirmationModal } from '../shared/ui/confirmation-modal';
import { QuotaExceededModal } from '../shared/ui/QuotaExceededModal';
import { QUERY_KEYS } from '../shared/constants/query-keys.constants';
import { UI_MESSAGES } from '../shared/constants/ui.constants';
import { KEYBOARD_KEYS } from '../shared/constants/keyboard.constants';
import { notifySuccess } from '../shared/ui/notifications';
import { useGlobalLoading } from '../app/global-loading';
import { useDebouncedValue } from '../shared/ui/use-debounced-value';
import { OfflineBanner } from '../shared/ui/offline-banner';
import { Breadcrumbs } from '../shared/ui/Breadcrumbs';
import { AppSidebar } from './AppSidebar';
import { AppTopbar } from './AppTopbar';
import { Link } from 'react-router-dom';

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
  const [onNoteModalClose, setOnNoteModalClose] = useState<(() => void) | undefined>(undefined);

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
    queryFn: () =>
      runQuery({
        query: debouncedSearchValue,
        workspaceSlug,
        limit: 5,
      }),
    enabled: Boolean(debouncedSearchValue.trim()),
  });
  const isSearching = searchQuery.isLoading || searchQuery.isFetching || searchValue.trim() !== debouncedSearchValue.trim();
  const activeNavItem = navItems.find((item) => item.view === view);
  const topbarTitle =
    view === 'note'
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

  // Quota status — non-critical (just warning dot), defer to improve FCP
  const [enableQuotaQuery, setEnableQuotaQuery] = useState(false);
  const quotaStatusQuery = useQuery({
    queryKey: ['billing', 'status'],
    queryFn: fetchSubscriptionStatus,
    staleTime: 60_000,
    enabled: enableQuotaQuery && Boolean(dashboard && activeWorkspace && !isSetupRoute),
  });
  const quotaStatus = quotaStatusQuery.data;
  const showQuotaWarningDot = quotaStatus ? hasQuotaWarning(quotaStatus) : false;

  useEffect(() => {
    if (dashboard && activeWorkspace && !isSetupRoute) {
      const timer = setTimeout(() => setEnableQuotaQuery(true), 200);
      return () => clearTimeout(timer);
    }
  }, [dashboard, activeWorkspace, isSetupRoute]);

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
    queryKey: QUERY_KEYS.PROJECTS.FOLDERS(noteModal?.mode === WorkspaceModalMode.Edit ? noteModal.note.project : ''),
    queryFn: () => fetchProjectFolders(noteModal?.mode === WorkspaceModalMode.Edit ? noteModal.note.project : ''),
    enabled: noteModal?.mode === WorkspaceModalMode.Edit,
  });
  const noteModalFolders = useMemo(
    () => flattenFolders(noteFoldersQuery.data?.folders || []),
    [noteFoldersQuery.data?.folders],
  );

  const loadNoteMutation = useMutation({
    mutationFn: (id: string) => globalLoading.trackPromise(fetchNote(id)),
    onSuccess: (note) => setNoteModal({ mode: WorkspaceModalMode.Edit, note }),
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
    mutationFn: ({ slug, favorite }: { slug: string; favorite: boolean }) => setProjectFavorite(slug, favorite),
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

    const currentProject = isProjectsRoot
      ? ''
      : routeProject || activeRouteNote?.project || selectedProject || dashboard.projects[0]?.projectSlug || '';
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
        void globalLoading
          .trackPromise(ensureNoteDetail(queryClient, id))
          .then((note) => {
            setSelectedProjectState(note.project);
            setSelectedNoteId(id);
            navigate(routes.note(id));
          })
          .catch((error) => {
            notifyGeneralFormError(error, UI_MESSAGES.COULD_NOT_OPEN_NOTE);
          });
      },
      editNote: (noteId: string) => {
        loadNoteMutation.mutate(noteId);
      },
      createNote: (
        projectSlug?: string,
        initialTitle?: string,
        initialAttachments?: Array<{ fileName: string; mimeType: string; sizeBytes: number; dataBase64: string }>,
      ) => {
        const slug = projectSlug || currentProject || dashboard.projects[0]?.projectSlug || UI_MESSAGES.DEFAULT_PROJECT_SLUG;
        setNoteModal({
          mode: WorkspaceModalMode.Create,
          projectSlug: slug,
          initialTitle,
          initialAttachments,
        });
      },
      onNoteModalClose,
      setOnNoteModalClose,
      deleteNote: (note: Pick<NoteSummary, 'id' | 'title'>) => {
        setConfirmState({ kind: ConfirmKind.Note, note: { ...note } as NoteSummary });
      },
    };
  }, [activeRouteNote?.project, dashboard, globalLoading, isProjectsRoot, navigate, queryClient, routeNoteId, routeProject, selectedNoteId, selectedProject, onNoteModalClose, loadNoteMutation]);

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
            <Link to="/profile" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600 }}>
              See quota usage
            </Link>
            {' · '}
            <Link to="/automations/subscription" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600 }}>
              Upgrade your plan
            </Link>
          </span>
        </div>
      )}
      <AppSidebar
        isMobileNavOpen={isMobileNavOpen}
        onCloseMobileNav={() => setIsMobileNavOpen(false)}
        view={view}
        activeWorkspace={activeWorkspace}
        projects={dashboard.projects}
        selectedProject={pageContext.selectedProject}
        onOpenProject={(slug) => pageContext.openProject(slug)}
        onToggleFavorite={(slug, favorite) => toggleFavoriteMutation.mutate({ slug, favorite })}
      />
      <main className="content">
        <AppTopbar
          isMobileNavOpen={isMobileNavOpen}
          onToggleMobileNav={() => setIsMobileNavOpen((current) => !current)}
          topbarTitle={topbarTitle}
          activeWorkspaceDisplayName={activeWorkspace.displayName}
          searchValue={searchValue}
          onSearchChange={(val) => {
            setSearchValue(val);
            setIsPopoverOpen(true);
            setFocusedIndex(-1);
          }}
          onSearchKeyDown={handleSearchKeyDown}
          isPopoverOpen={isPopoverOpen}
          onFocusSearch={() => setIsPopoverOpen(true)}
          isSearching={isSearching}
          searchResults={searchQuery.data?.matches}
          focusedIndex={focusedIndex}
          onSelectResult={(noteId) => {
            pageContext.openNote(noteId);
            setSearchValue('');
            setIsPopoverOpen(false);
            setFocusedIndex(-1);
          }}
          onAskAiShortcut={() => navigate(`${routes.search}?focus=input`)}
          commandBarRef={commandBarRef}
          profileMenuRef={profileMenuRef}
          isProfileMenuOpen={isProfileMenuOpen}
          onToggleProfileMenu={() => setIsProfileMenuOpen((current) => !current)}
          currentUser={currentUser}
          showQuotaWarningDot={showQuotaWarningDot}
          quotaStatus={quotaStatus}
          view={view}
          onSignOut={() => {
            void globalLoading.trackPromise(logout()).finally(() => {
              queryClient.clear();
              dashboardQuery.refetch();
            });
          }}
        />
        <section className="view" aria-live="polite">
          <Breadcrumbs projects={dashboard.projects} />
          <PageContextProvider value={pageContext}>
            <Suspense fallback={<GlobalLoadingOverlay />}>
              <Routes>
                <Route path="/" element={<HomePage {...pageContext} />} />
                <Route path="/projects" element={<ProjectsPage {...pageContext} />} />
                <Route
                  path="/map"
                  element={
                    <ProjectKnowledgeMapPage
                      dashboard={pageContext.dashboard}
                      openNote={pageContext.openNote}
                      selectedProject={pageContext.selectedProject}
                    />
                  }
                />
                <Route
                  path="/map/:projectSlug"
                  element={
                    <ProjectKnowledgeMapPage
                      dashboard={pageContext.dashboard}
                      openNote={pageContext.openNote}
                      selectedProject={pageContext.selectedProject}
                    />
                  }
                />
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
          </PageContextProvider>
        </section>
      </main>
      {noteModal ? (
        <ProjectNoteModal
          key={noteModal.mode === WorkspaceModalMode.Edit ? `edit-${noteModal.note.id}` : `create-${noteModal.projectSlug}`}
          folders={noteModal.mode === WorkspaceModalMode.Edit ? noteModalFolders : undefined}
          mode={noteModal.mode}
          note={noteModal.mode === WorkspaceModalMode.Edit ? noteModal.note : undefined}
          onClose={() => {
            setNoteModal(null);
            if (onNoteModalClose) {
              onNoteModalClose();
              setOnNoteModalClose(undefined);
            }
          }}
          onSaved={async (_noteId, mode) => {
            setNoteModal(null);
            notifySuccess(mode === WorkspaceModalMode.Create ? UI_MESSAGES.NOTE_CREATED : UI_MESSAGES.NOTE_UPDATED);
            await refreshDashboard(queryClient);
            if (onNoteModalClose) {
              onNoteModalClose();
              setOnNoteModalClose(undefined);
            }
          }}
          projectSlug={noteModal.mode === WorkspaceModalMode.Edit ? noteModal.note.project : noteModal.projectSlug}
          initialFolderId={noteModal.mode === WorkspaceModalMode.Edit ? noteModal.note.folderId || undefined : undefined}
          initialTitle={noteModal.mode === WorkspaceModalMode.Create ? noteModal.initialTitle : undefined}
          initialAttachments={
            noteModal.mode === WorkspaceModalMode.Edit
              ? noteModal.note.attachments?.map((att) => ({
                  fileName: att.fileName,
                  mimeType: att.mimeType,
                  sizeBytes: att.sizeBytes,
                  dataBase64: '',
                }))
              : noteModal.mode === WorkspaceModalMode.Create
                ? noteModal.initialAttachments
                : undefined
          }
          projects={dashboard.projects}
          workspaceSlug={workspaceSlug}
        />
      ) : null}
      {confirmState?.kind === ConfirmKind.Note ? (
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
        <QuotaExceededModal error={quotaExceededError} onClose={() => setQuotaExceededError(null)} />
      ) : null}
    </div>
  );
}

async function refreshDashboard(queryClient: ReturnType<typeof useQueryClient>) {
  await invalidateNoteRelatedQueries(queryClient);
}
