import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import type { PageContext } from '../app/page-context';
import { navItems, routes, type View } from '../app/routing/routes';
import { ApiClientError, fetchDashboard, login, logout, signup } from '../shared/api/client';
import { HomePage } from '../pages/home/HomePage';
import { IntegrationsPage } from '../pages/integrations/IntegrationsPage';
import { ProjectsPage } from '../pages/projects/ProjectsPage';
import { RemindersPage } from '../pages/reminders/RemindersPage';
import { ReviewsPage } from '../pages/reviews/ReviewsPage';
import { SearchPage } from '../pages/search/SearchPage';
import { SetupPage } from '../pages/setup/SetupPage';
import { VaultPage } from '../pages/vault/VaultPage';
import { applyBackendFieldErrors, fieldNamesFromErrors, focusFirstFormError, notifyGeneralFormError } from '../shared/forms/errors';
import { FormField } from '../shared/forms/fields';
import { createAuthFormSchema, type AuthFormValues, type AuthMode } from './app-shell-auth.forms';
import { Inspector } from './Inspector';

function activeView(pathname: string): View {
  if (pathname.startsWith('/projects')) return 'projects';
  if (pathname.startsWith('/vault')) return 'vault';
  if (pathname.startsWith('/reviews')) return 'reviews';
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
  const [selectedReviewId, setSelectedReviewId] = useState('');

  const view = activeView(location.pathname);
  const routeProject = routeParam(location.pathname, '/projects/');
  const routeNoteId = routeParam(location.pathname, '/vault/');
  const routeReviewId = routeParam(location.pathname, '/reviews/');
  const activeWorkspace = dashboard?.workspaces[0] || null;
  const isSetupRoute = location.pathname.startsWith(routes.setup);

  const pageContext = useMemo<PageContext | null>(() => {
    if (!dashboard) return null;

    const currentProject = routeProject || selectedProject || dashboard.projects[0]?.projectSlug || '';
    const currentNote = routeNoteId || selectedNoteId || dashboard.notes[0]?.id || '';
    const currentReview = routeReviewId || selectedReviewId || dashboard.reviews[0]?.id || '';

    return {
      dashboard,
      selectedProject: currentProject,
      selectedNoteId: currentNote,
      selectedReviewId: currentReview,
      setSelectedProject: (slug: string) => {
        setSelectedProjectState(slug);
        navigate(routes.project(slug));
      },
      openNote: (id: string) => {
        setSelectedNoteId(id);
        navigate(routes.note(id));
      },
      openReview: (id: string) => {
        setSelectedReviewId(id);
        navigate(routes.review(id));
      },
    };
  }, [dashboard, navigate, routeNoteId, routeProject, routeReviewId, selectedNoteId, selectedProject, selectedReviewId]);

  if (dashboardQuery.error instanceof ApiClientError && dashboardQuery.error.status === 401) {
    return <AuthScreen onAuthenticated={() => dashboardQuery.refetch()} />;
  }

  if (!dashboard || !pageContext) return <div className="boot-state">Carregando Knowledge Vault...</div>;
  if (isSetupRoute) return <SetupPage dashboard={dashboard} refetchDashboard={() => dashboardQuery.refetch()} />;
  if (!activeWorkspace) return <Navigate replace to={routes.setup} />;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegacao do vault">
        <div className="brand">
          <div className="brand-mark">KV</div>
          <div>
            <strong>Knowledge Vault</strong>
            <span>developer knowledge base</span>
          </div>
        </div>
        <nav className="main-nav" aria-label="Secoes principais">
          {navItems.map((item) => (
            <NavLink className={({ isActive }) => `nav-item ${isActive || view === item.view ? 'active' : ''}`} end={item.path === routes.home} key={item.view} to={item.path}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <section className="sidebar-section">
          <div className="section-label">Workspace</div>
          <button className="workspace-pill" type="button">
            <span className="status-dot" />
            {activeWorkspace.workspaceSlug}
          </button>
        </section>
        <section className="sidebar-section">
          <div className="section-label">Projetos</div>
          <div className="tree">
            {dashboard.projects.map((project) => (
              <button
                className={`tree-item ${project.projectSlug === pageContext.selectedProject ? 'active' : ''}`}
                type="button"
                key={project.projectSlug}
                onClick={() => pageContext.setSelectedProject(project.projectSlug)}
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
          <label className="command-bar">
            <span>&gt;_</span>
            <input type="search" placeholder="Buscar notas, reviews, paths ou tags" onKeyDown={(event) => { if (event.key === 'Enter') navigate(routes.search); }} />
          </label>
          <div className="topbar-meta">
            <span>{dashboard.notes.length} docs</span>
            <button
              className="topbar-link"
              type="button"
              onClick={() => {
                logout().finally(() => {
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
            <Route path="/vault" element={<VaultPage {...pageContext} />} />
            <Route path="/vault/:noteId" element={<VaultPage {...pageContext} />} />
            <Route path="/reviews" element={<ReviewsPage {...pageContext} />} />
            <Route path="/reviews/:reviewId" element={<ReviewsPage {...pageContext} />} />
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
          selectedReviewId={pageContext.selectedReviewId}
          view={view}
        />
      </aside>
    </div>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<AuthMode>('login');
  const formRef = useRef<HTMLFormElement>(null);
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
    mutationFn: (values: AuthFormValues) => (
      mode === 'login'
        ? login({ email: values.email, password: values.password })
        : signup({ name: values.name || '', email: values.email, password: values.password })
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
      <section className="auth-panel" aria-label="Autenticacao">
        <div className="brand auth-brand">
          <div className="brand-mark">KV</div>
          <div>
            <strong>Knowledge Vault</strong>
            <span>developer knowledge base</span>
          </div>
        </div>
        <div className="segmented-control" role="tablist" aria-label="Modo de acesso">
          <button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => setMode('login')}>
            Entrar
          </button>
          <button className={mode === 'signup' ? 'active' : ''} type="button" onClick={() => setMode('signup')}>
            Criar conta
          </button>
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
    </main>
  );
}
