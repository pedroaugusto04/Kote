import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import type { PageContext } from '../app/page-context';
import { navItems, routes, type View } from '../app/routing/routes';
import { ApiClientError, deleteNote, fetchDashboard, fetchNote, fetchProjectFolders, logout } from '../shared/api/client';
import type { NoteSummary } from '../shared/api/models/note';
import { ensureNoteDetail, getCachedNoteDetail, invalidateNoteRelatedQueries, noteDetailQueryOptions } from '../shared/api/note-query';
import { HomePage } from '../pages/home/HomePage';
import { IntegrationsPage } from '../pages/integrations/IntegrationsPage';
import { ProjectsPage } from '../pages/projects/ProjectsPage';
import { RemindersPage } from '../pages/reminders/RemindersPage';
import { SearchPage } from '../pages/search/SearchPage';
import { SetupPage } from '../pages/setup/SetupPage';
import { VaultPage } from '../pages/vault/VaultPage';
import { LandingPage } from '../pages/landing/LandingPage';
import { AuthPage } from '../pages/auth/AuthPage';
import { flattenFolders } from '../features/projects/projects.helpers';
import { ProjectNoteModal } from '../features/projects/modals/ProjectNoteModal';
import type { ConfirmState, NoteModalState } from '../features/projects/projects.types';
import { notifyGeneralFormError } from '../shared/forms/errors';
import { ConfirmationModal } from '../shared/ui/confirmation-modal';
import { notifySuccess } from '../shared/ui/notifications';
import { useGlobalLoading } from '../app/global-loading';
import { useTheme } from '../app/providers/theme';


function activeView(pathname: string): View {
  if (pathname.startsWith('/projects')) return 'projects';
  if (pathname.startsWith('/vault')) return 'note';
  if (pathname.startsWith('/search')) return 'search';
  if (pathname.startsWith('/reminders')) return 'reminders';
  if (pathname.startsWith('/settings/integrations')) return 'integrations';
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
  const { effectiveTheme, toggleTheme } = useTheme();
  const dashboardQuery = useQuery({
    queryKey: ['dashboard'],
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
  const [noteModal, setNoteModal] = useState<NoteModalState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const view = activeView(location.pathname);
  const routeProject = routeParam(location.pathname, '/projects/');
  const routeNoteId = routeParam(location.pathname, '/vault/');
  const activeWorkspace = dashboard?.workspaces[0] || null;
  const isSetupRoute = location.pathname.startsWith(routes.setup);
  const activeNavItem = navItems.find((item) => item.view === view);
  const topbarTitle = view === 'note' ? 'Note details' : activeNavItem?.label || 'Home';
  const routeNoteQuery = useQuery(noteDetailQueryOptions(routeNoteId));
  const cachedRouteNote = getCachedNoteDetail(queryClient, routeNoteId);
  const activeRouteNote = routeNoteQuery.data || cachedRouteNote;
  const shouldBlockNoteRoute = Boolean(routeNoteId) && routeNoteQuery.isLoading && !activeRouteNote;
  const isUnauthorized = dashboardQuery.error instanceof ApiClientError && dashboardQuery.error.status === 401;

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
  }, [location.pathname]);

  const noteFoldersQuery = useQuery({
    queryKey: ['project-folders', 'app-shell-note-modal', noteModal?.mode === 'edit' ? noteModal.note.project : ''],
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
    onError: (error) => notifyGeneralFormError(error, 'Could not load the note for editing.'),
  });
  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => globalLoading.trackPromise(deleteNote(id)),
    onSuccess: async (_, noteId) => {
      setConfirmState(null);
      setSelectedNoteId((current) => (current === noteId ? '' : current));
      if (routeNoteId === noteId) {
        navigate(routes.vault);
      }
      notifySuccess('Note deleted successfully.');
      await refreshDashboard(queryClient);
    },
    onError: (error) => notifyGeneralFormError(error, 'Could not delete the note.'),
  });

  useEffect(() => {
    if (!isMobileNavOpen) return undefined;

    const originalOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileNavOpen(false);
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

    const currentProject = routeProject || activeRouteNote?.project || selectedProject || dashboard.projects[0]?.projectSlug || '';
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
        navigate(routes.project(slug));
      },
      openNote: (id: string) => {
        void globalLoading.trackPromise(
          ensureNoteDetail(queryClient, id),
        ).then((note) => {
          setSelectedProjectState(note.project);
          setSelectedNoteId(id);
          navigate(routes.note(id));
        }).catch((error) => {
          notifyGeneralFormError(error, 'Could not open the note.');
        });
      },
      editNote: (noteId: string) => {
        loadNoteMutation.mutate(noteId);
      },
      deleteNote: (note: Pick<NoteSummary, 'id' | 'title'>) => {
        setConfirmState({ kind: 'note', note: { ...note } as NoteSummary });
      },
    };
  }, [activeRouteNote?.project, dashboard, globalLoading, navigate, queryClient, routeNoteId, routeProject, selectedNoteId, selectedProject, view]);

  if (isUnauthorized) {
    return (
      <Routes>
        <Route path={routes.home} element={<LandingPage />} />
        <Route path={routes.auth} element={<AuthPage onAuthenticated={() => dashboardQuery.refetch()} />} />
        <Route path="*" element={<Navigate replace to={routes.auth} />} />
      </Routes>
    );
  }

  if (!dashboard || !pageContext) return null;
  if (isSetupRoute) return <SetupPage dashboard={dashboard} refetchDashboard={() => dashboardQuery.refetch()} />;
  if (!activeWorkspace) return <Navigate replace to={routes.setup} />;
  if (location.pathname === routes.auth) return <Navigate replace to={routes.home} />;

  return (
    <div className="app-shell">
      <button
        aria-label="Close navigation"
        aria-hidden={!isMobileNavOpen}
        className={`mobile-nav-backdrop ${isMobileNavOpen ? 'visible' : ''}`}
        onClick={() => setIsMobileNavOpen(false)}
        tabIndex={isMobileNavOpen ? 0 : -1}
        type="button"
      />
      <aside className={`sidebar ${isMobileNavOpen ? 'open' : ''}`} aria-label="Vault navigation" id="app-sidebar">
        <Link className="brand" to={routes.home} aria-label="Go to Home">
          <div className="brand-mark">KV</div>
          <div>
            <strong>Knowledge Vault</strong>
            <span>developer knowledge base</span>
          </div>
        </Link>
        <nav className="main-nav" aria-label="Main sections">
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
          <div className="section-label">Workspace</div>
          <div className="workspace-pill workspace-pill-static" aria-label={`Current workspace: ${activeWorkspace.workspaceSlug}`} role="status">
            <span className="status-dot" />
            <span className="workspace-pill-copy">
              <strong>{activeWorkspace.displayName}</strong>
              <small>{activeWorkspace.workspaceSlug}</small>
            </span>
          </div>
        </section>
        <section className="sidebar-section">
          <div className="section-label">Projects</div>
          <div className="tree">
            {dashboard.projects.map((project) => (
              <button
                className={`tree-item ${project.projectSlug === pageContext.selectedProject ? 'active' : ''}`}
                type="button"
                key={project.projectSlug}
                onClick={() => {
                  pageContext.openProject(project.projectSlug);
                  setIsMobileNavOpen(false);
                }}
              >
                <span className="file-icon">P</span>
                <span>{project.displayName}</span>
              </button>
            ))}
          </div>
        </section>
      </aside>
      <main className="content">
        <header className="topbar">
          <div className="topbar-leading">
            <button
              aria-label="menu"
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
          <label className="command-bar">
            <span>&gt;_</span>
            <input type="search" placeholder="Search notes, paths, or tags" onKeyDown={(event) => { 
              if (event.key === 'Enter') {
                const q = event.currentTarget.value.trim();
                navigate(q ? `${routes.search}?q=${encodeURIComponent(q)}` : routes.search); 
              }
            }} />
          </label>
          <div className="topbar-meta">
            <button
              aria-label={effectiveTheme === 'dark' ? 'Enable light mode' : 'Enable dark mode'}
              className="topbar-link theme-toggle"
              onClick={toggleTheme}
              title={effectiveTheme === 'dark' ? 'Enable light mode' : 'Enable dark mode'}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                {effectiveTheme === 'dark' ? (
                  <>
                    <circle cx="12" cy="12" r="4.25" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M12 2.75v2.1M12 19.15v2.1M21.25 12h-2.1M4.85 12h-2.1M18.54 5.46l-1.48 1.48M6.94 17.06l-1.48 1.48M18.54 18.54l-1.48-1.48M6.94 6.94L5.46 5.46" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                  </>
                ) : (
                  <path d="M13.948 3.464a1 1 0 0 0-1.29 1.248 7.25 7.25 0 1 1-8.946 8.946 1 1 0 0 0-1.248 1.29A9.25 9.25 0 1 0 13.948 3.464Z" fill="currentColor" />
                )}
              </svg>
            </button>
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
              Sign out
            </button>
          </div>
        </header>
        <section className="view" aria-live="polite">
          <Routes>
            <Route path="/" element={<HomePage {...pageContext} />} />
            <Route path="/projects" element={<ProjectsPage {...pageContext} />} />
            <Route path="/projects/:projectSlug" element={<ProjectsPage {...pageContext} />} />
            <Route path="/vault" element={<Navigate replace to={routes.projects} />} />
            <Route path="/vault/:noteId" element={shouldBlockNoteRoute ? null : <VaultPage {...pageContext} />} />
            <Route path="/search" element={<SearchPage {...pageContext} />} />
            <Route path="/reminders" element={<RemindersPage {...pageContext} />} />
            <Route path="/settings/integrations" element={<IntegrationsPage workspaceSlug={activeWorkspace.workspaceSlug} />} />
            <Route path="*" element={<HomePage {...pageContext} />} />
          </Routes>
        </section>
      </main>
      {noteModal ? (
        <ProjectNoteModal
          folders={noteModalFolders}
          mode={noteModal.mode}
          note={noteModal.mode === 'edit' ? noteModal.note : undefined}
          onClose={() => setNoteModal(null)}
          onSaved={async (noteId, mode) => {
            setNoteModal(null);
            notifySuccess(mode === 'create' ? 'Note created successfully.' : 'Note updated successfully.');
            await refreshDashboard(queryClient);
            if (mode === 'create' && noteId) {
              pageContext.openNote(noteId);
            }
          }}
          projectSlug={noteModal.mode === 'edit' ? noteModal.note.project : ''}
          initialFolderId={noteModal.mode === 'edit' ? noteModal.note.folderId || undefined : undefined}
        />
      ) : null}
      {confirmState?.kind === 'note' ? (
        <ConfirmationModal
          busy={deleteNoteMutation.isPending}
          cancelLabel="Cancel"
          confirmLabel="Confirm deletion"
          description={`Deleting note ${confirmState.note.title} also removes its linked reminder, when present.`}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => deleteNoteMutation.mutate(confirmState.note.id)}
          title="Delete note"
        />
      ) : null}
    </div>
  );
}

async function refreshDashboard(queryClient: ReturnType<typeof useQueryClient>) {
  await invalidateNoteRelatedQueries(queryClient);
}
