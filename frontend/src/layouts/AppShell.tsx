import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import type { PageContext } from '../app/page-context';
import { navItems, routes, type View } from '../app/routing/routes';
import { fetchDashboard, login, logout, signup } from '../shared/api/client';
import { HomePage } from '../pages/home/HomePage';
import { IntegrationsPage } from '../pages/integrations/IntegrationsPage';
import { ProjectsPage } from '../pages/projects/ProjectsPage';
import { RemindersPage } from '../pages/reminders/RemindersPage';
import { ReviewsPage } from '../pages/reviews/ReviewsPage';
import { SearchPage } from '../pages/search/SearchPage';
import { VaultPage } from '../pages/vault/VaultPage';
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
  const dashboardQuery = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard });
  const dashboard = dashboardQuery.data;
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedProject, setSelectedProjectState] = useState('n8n-automations');
  const [selectedNoteId, setSelectedNoteId] = useState('');
  const [selectedReviewId, setSelectedReviewId] = useState('');

  const view = activeView(location.pathname);
  const routeProject = routeParam(location.pathname, '/projects/');
  const routeNoteId = routeParam(location.pathname, '/vault/');
  const routeReviewId = routeParam(location.pathname, '/reviews/');

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

  if (dashboardQuery.error instanceof Error && dashboardQuery.error.message === 'request_failed:401') {
    return <AuthScreen onAuthenticated={() => dashboardQuery.refetch()} />;
  }

  if (!dashboard || !pageContext) return <div className="boot-state">Carregando Knowledge Vault...</div>;

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
            {dashboard.workspaces[0]?.workspaceSlug || 'default'}
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
            <Route path="/settings/integrations" element={<IntegrationsPage />} />
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
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation({
    mutationFn: () => (mode === 'login' ? login({ email, password }) : signup({ name, email, password })),
    onSuccess: onAuthenticated,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

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
        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' ? (
            <label className="form-field">
              Nome
              <input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
          ) : null}
          <label className="form-field">
            Email
            <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="form-field">
            Senha
            <input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {mutation.isError ? <p className="form-error">Nao foi possivel autenticar com esses dados.</p> : null}
          <button className="icon-button auth-submit" type="submit" disabled={mutation.isPending}>
            {mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </section>
    </main>
  );
}
