import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import type { PageContext } from '../app/page-context';
import { navItems, routes, type View } from '../app/routing/routes';
import { ApiClientError, deleteNote, fetchDashboard, fetchNote, fetchProjectFolders, login, logout, signup } from '../shared/api/client';
import type { NoteSummary } from '../shared/api/models/note';
import { ensureNoteDetail, getCachedNoteDetail, noteDetailQueryOptions } from '../shared/api/note-query';
import { HomePage } from '../pages/home/HomePage';
import { IntegrationsPage } from '../pages/integrations/IntegrationsPage';
import { ProjectsPage } from '../pages/projects/ProjectsPage';
import { RemindersPage } from '../pages/reminders/RemindersPage';
import { SearchPage } from '../pages/search/SearchPage';
import { SetupPage } from '../pages/setup/SetupPage';
import { VaultPage } from '../pages/vault/VaultPage';
import { flattenFolders } from '../features/projects/projects.helpers';
import { ProjectNoteModal } from '../features/projects/modals/ProjectNoteModal';
import type { ConfirmState, NoteModalState } from '../features/projects/projects.types';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../shared/forms/errors';
import { FormField } from '../shared/forms/fields';
import { ConfirmationModal } from '../shared/ui/confirmation-modal';
import { notifySuccess } from '../shared/ui/notifications';
import { useGlobalLoading } from '../app/global-loading';
import { createAuthFormSchema, type AuthFormValues, type AuthMode } from './app-shell-auth.forms';
import { Inspector } from './Inspector';

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
  const topbarTitle = view === 'note' ? 'Detalhe da Nota' : activeNavItem?.label || 'Home';
  const routeNoteQuery = useQuery(noteDetailQueryOptions(routeNoteId));
  const cachedRouteNote = getCachedNoteDetail(queryClient, routeNoteId);
  const activeRouteNote = routeNoteQuery.data || cachedRouteNote;
  const shouldBlockNoteRoute = Boolean(routeNoteId) && routeNoteQuery.isLoading && !activeRouteNote;

  useEffect(() => {
    if (dashboardQuery.isLoading && !dashboardQuery.data) {
      globalLoading.start();
      return () => globalLoading.stop();
    }
    return undefined;
  }, [dashboardQuery.data, dashboardQuery.isLoading, globalLoading]);

  useEffect(() => {
    if (shouldBlockNoteRoute) {
      globalLoading.start();
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
    onError: (error) => notifyGeneralFormError(error, 'Nao foi possivel carregar a nota para edicao.'),
  });
  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => globalLoading.trackPromise(deleteNote(id)),
    onSuccess: async (_, noteId) => {
      setConfirmState(null);
      setSelectedNoteId((current) => (current === noteId ? '' : current));
      if (routeNoteId === noteId) {
        navigate(routes.vault);
      }
      notifySuccess('Nota excluida com sucesso.');
      await refreshDashboard(queryClient);
    },
    onError: (error) => notifyGeneralFormError(error, 'Nao foi possivel excluir a nota.'),
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
          notifyGeneralFormError(error, 'Nao foi possivel abrir a nota.');
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

  if (dashboardQuery.error instanceof ApiClientError && dashboardQuery.error.status === 401) {
    return <AuthScreen onAuthenticated={() => dashboardQuery.refetch()} />;
  }

  if (!dashboard || !pageContext) return <div className="boot-state">Carregando Knowledge Vault...</div>;
  if (isSetupRoute) return <SetupPage dashboard={dashboard} refetchDashboard={() => dashboardQuery.refetch()} />;
  if (!activeWorkspace) return <Navigate replace to={routes.setup} />;

  return (
    <div className="app-shell">
      <button
        aria-label="Fechar navegacao"
        aria-hidden={!isMobileNavOpen}
        className={`mobile-nav-backdrop ${isMobileNavOpen ? 'visible' : ''}`}
        onClick={() => setIsMobileNavOpen(false)}
        tabIndex={isMobileNavOpen ? 0 : -1}
        type="button"
      />
      <aside className={`sidebar ${isMobileNavOpen ? 'open' : ''}`} aria-label="Navegacao do vault" id="app-sidebar">
        <Link className="brand" to={routes.home} aria-label="Ir para Home">
          <div className="brand-mark">KV</div>
          <div>
            <strong>Knowledge Vault</strong>
            <span>developer knowledge base</span>
          </div>
        </Link>
        <nav className="main-nav" aria-label="Secoes principais">
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
          <div className="workspace-pill workspace-pill-static" aria-label={`Workspace atual: ${activeWorkspace.workspaceSlug}`} role="status">
            <span className="status-dot" />
            <span className="workspace-pill-copy">
              <strong>{activeWorkspace.displayName}</strong>
              <small>{activeWorkspace.workspaceSlug}</small>
            </span>
          </div>
        </section>
        <section className="sidebar-section">
          <div className="section-label">Projetos</div>
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
            <input type="search" placeholder="Buscar notas, paths ou tags" onKeyDown={(event) => { 
              if (event.key === 'Enter') {
                const q = event.currentTarget.value.trim();
                navigate(q ? `${routes.search}?q=${encodeURIComponent(q)}` : routes.search); 
              }
            }} />
          </label>
          <div className="topbar-meta">
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
              sair
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
      <aside className="inspector" aria-label="Contexto da nota">
        <Inspector
          dashboard={dashboard}
          selectedProject={pageContext.selectedProject}
          selectedNoteId={pageContext.selectedNoteId}
        />
      </aside>
      {noteModal ? (
        <ProjectNoteModal
          folders={noteModalFolders}
          mode={noteModal.mode}
          note={noteModal.mode === 'edit' ? noteModal.note : undefined}
          onClose={() => setNoteModal(null)}
          onSaved={async (noteId, mode) => {
            setNoteModal(null);
            notifySuccess(mode === 'create' ? 'Nota criada com sucesso.' : 'Nota atualizada com sucesso.');
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
          cancelLabel="Cancelar"
          confirmLabel="Confirmar exclusão"
          description={`A exclusao da nota ${confirmState.note.title} tambem remove o lembrete vinculado, quando existir.`}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => deleteNoteMutation.mutate(confirmState.note.id)}
          title="Excluir nota"
        />
      ) : null}
    </div>
  );
}

async function refreshDashboard(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  await queryClient.invalidateQueries({ queryKey: ['notes'] });
  await queryClient.invalidateQueries({ queryKey: ['search'] });
  await queryClient.invalidateQueries({ queryKey: ['search-notes'] });
  await queryClient.invalidateQueries({ queryKey: ['project-folders'] });
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const globalLoading = useGlobalLoading();
  const [mode, setMode] = useState<AuthMode>('login');
  const formRef = useRef<HTMLFormElement>(null);
  const authBenefits = [
    'Capture decisões e aprendizados no fluxo real do trabalho',
    'Transforme eventos e conversas em histórico pesquisável',
    'Acelere onboarding e reduza perda de contexto entre pessoas',
  ];
  const authSteps = [
    'Conecte seu workspace',
    'Capture conhecimento por integrações e uso diário',
    'Recupere contexto por projeto, nota e busca',
  ];
  const authCopy = {
    login: {
      title: 'Entrar no seu workspace',
      description: 'Acesse seu histórico, projetos e integrações em andamento.',
    },
    signup: {
      title: 'Criar conta para começar',
      description: 'Configure seu acesso e comece a centralizar o conhecimento.',
    },
  } satisfies Record<AuthMode, { title: string; description: string }>;
  const schema = useMemo(() => createAuthFormSchema(mode), [mode]);
  const {
    clearErrors,
    formState: { errors },
    getValues,
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<AuthFormValues>({
    resolver: zodResolver(schema),
    shouldFocusError: false,
    defaultValues: { name: '', email: '', password: '' },
  });
  const mutation = useMutation({
    mutationFn: (values: AuthFormValues) => globalLoading.trackPromise(
      mode === 'login'
        ? login({ email: values.email, password: values.password })
        : signup({ name: values.name || '', email: values.email, password: values.password }),
    ),
    onSuccess: onAuthenticated,
    onError: (error) => {
      const fieldNames = applyBackendFieldErrors<AuthFormValues>(error, setError);
      if (fieldNames.length > 0) {
        window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNames));
        return;
      }
      notifyGeneralFormError(error, 'Nao foi possivel autenticar com esses dados.');
    },
  });

  useEffect(() => {
    mutation.reset();
    clearErrors();
    reset({ name: '', email: getValues('email'), password: getValues('password') });
  }, [mode]);

  const onInvalid = (invalidErrors: typeof errors) => {
    window.requestAnimationFrame(() => focusFirstFormError(formRef.current, fieldNamesFromErrors(invalidErrors)));
  };

  return (
    <main className="auth-layout">
      <section className="auth-landing" aria-label="Entrada do Knowledge Vault">
        <section className="auth-hero" aria-labelledby="auth-hero-title">
          <div className="auth-hero-copy">
            <h1 id="auth-hero-title">Informações e contexto em um só lugar.</h1>
            <p className="auth-lead">
              Capture continuamente decisões, conversas e sinais operacionais. Encontre depois com busca clara e recupere contexto com rapidez.
            </p>
          </div>
          <div className="auth-benefits-card">
            <h2>Por que entrar por aqui</h2>
            <ul className="auth-benefits-list">
              {authBenefits.map((benefit) => (
                <li key={benefit}>{benefit}</li>
              ))}
            </ul>
          </div>
          <div className="auth-flow-card">
            <div className="auth-flow-head">
              <h2>Como funciona</h2>
              <p>Da captura diária até a recuperação de contexto em poucos passos.</p>
            </div>
            <ol className="auth-steps-list">
              {authSteps.map((step, index) => (
                <li key={step}>
                  <span className="auth-step-index">0{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section className="auth-panel" aria-label="Autenticacao">
          <Link className="brand auth-brand" to={routes.home} aria-label="Ir para Home">
            <div className="brand-mark">KV</div>
            <div>
              <strong>Knowledge Vault</strong>
              <span>developer knowledge base</span>
            </div>
          </Link>
          <div className="segmented-control" role="tablist" aria-label="Modo de acesso">
            <button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => setMode('login')}>
              Entrar
            </button>
            <button className={mode === 'signup' ? 'active' : ''} type="button" onClick={() => setMode('signup')}>
              Criar conta
            </button>
          </div>
          <div className="auth-panel-copy">
            <h2>{authCopy[mode].title}</h2>
            <p>{authCopy[mode].description}</p>
          </div>
          <form className="auth-form" ref={formRef} noValidate onSubmit={handleSubmit((values) => mutation.mutate(values), onInvalid)}>
            {mode === 'signup' ? (
              <FormField name="name" label="Nome" error={errors.name?.message} required>
                {(fieldProps) => <input autoComplete="name" {...fieldProps} {...register('name')} />}
              </FormField>
            ) : null}
            <FormField name="email" label="Email" error={errors.email?.message} required>
              {(fieldProps) => <input autoComplete="email" type="email" {...fieldProps} {...register('email')} />}
            </FormField>
            <FormField name="password" label="Senha" error={errors.password?.message} required>
              {(fieldProps) => <input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type="password" {...fieldProps} {...register('password')} />}
            </FormField>
            <button className="icon-button auth-submit" type="submit" disabled={mutation.isPending}>
              {mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
