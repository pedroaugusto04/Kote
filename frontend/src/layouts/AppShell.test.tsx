import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../app/test-utils';
import { AppShell } from './AppShell';

const dashboard = {
  workspaces: [{ workspaceSlug: 'default', displayName: 'Default', githubRepos: ['acme/repo'], projectSlugs: ['n8n-automations'] }],
  projects: [
    {
      projectSlug: 'n8n-automations',
      displayName: 'N8N Automations',
      repoFullName: 'acme/repo',
      workspaceSlug: 'default',
      aliases: ['n8n'],
      defaultTags: ['backend', 'automation'],
      enabled: true,
    },
  ],
  notes: [
    {
      id: 'note-1',
      path: '20 Inbox/note.md',
      type: 'event',
      title: 'Deploy rollout',
      project: 'n8n-automations',
      workspace: 'default',
      tags: ['deploy'],
      date: '2026-04-27',
      status: 'open',
      summary: 'Revisar deploy.',
      source: 'test',
    },
  ],
  reviews: [
    {
      id: 'review-1',
      title: 'Review do push',
      repo: 'acme/repo',
      project: 'n8n-automations',
      branch: 'main',
      date: '2026-04-27',
      status: 'open',
      summary: 'Sem regressao critica.',
      impact: 'Baixo',
      changedFiles: ['src/app.ts'],
      generatedNotePath: 'reviews/review.md',
      findings: [{ severity: 'low', file: 'src/app.ts', line: 3, summary: 'Ajuste menor', recommendation: 'Revisar', status: 'open' }],
    },
  ],
  reminders: [],
  home: {
    windowDays: 7,
    metrics: [
      { id: 'recent-notes', label: 'Mudancas recentes', value: 1, meta: 'notas em 7 dias', tone: 'active' },
      { id: 'active-projects', label: 'Projetos ativos', value: 1, meta: 'com movimento recente', tone: 'active' },
      { id: 'open-reminders', label: 'Lembretes abertos', value: 0, meta: '0 vencidos', tone: 'active' },
      { id: 'open-findings', label: 'Findings abertos', value: 0, meta: '0 reviews com pendencias', tone: 'active' },
    ],
    activityByDay: [
      { date: '2026-04-21', label: '21/04', count: 0 },
      { date: '2026-04-22', label: '22/04', count: 0 },
      { date: '2026-04-23', label: '23/04', count: 0 },
      { date: '2026-04-24', label: '24/04', count: 0 },
      { date: '2026-04-25', label: '25/04', count: 0 },
      { date: '2026-04-26', label: '26/04', count: 0 },
      { date: '2026-04-27', label: '27/04', count: 1 },
    ],
    activityByProject: [{ project: 'n8n-automations', label: 'N8N Automations', count: 1 }],
    priorities: [],
    recentInterestingEvents: [
      {
        id: 'note-1',
        type: 'event',
        title: 'Deploy rollout',
        project: 'n8n-automations',
        date: '2026-04-27',
        summary: 'Revisar deploy.',
        status: 'open',
        target: { kind: 'note', id: 'note-1', path: '20 Inbox/note.md' },
      },
    ],
  },
};

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/dashboard') {
      return Response.json(dashboard);
    }
    if (url === '/api/integrations') {
      return Response.json({
        ok: true,
        workspaceSlug: 'default',
        integrations: [
          {
            id: 'github-app',
            name: 'GitHub App',
            description: 'Instalacao do app e webhook assinado.',
            status: 'connected',
            requiredEnv: ['KB_GITHUB_APP_INSTALL_URL', 'KB_GITHUB_APP_WEBHOOK_SECRET'],
            configuredEnv: ['KB_GITHUB_APP_INSTALL_URL', 'KB_GITHUB_APP_WEBHOOK_SECRET'],
            missingEnv: [],
            links: [{ label: 'Instalar GitHub App', url: 'https://github.com/apps/kb/installations/new', external: true }],
            checklist: ['Instalar o GitHub App nos repositorios do workspace.'],
            warnings: [],
          },
          {
            id: 'telegram',
            name: 'Telegram',
            description: 'Bot e chat para notificacoes.',
            status: 'missing',
            requiredEnv: ['KB_TELEGRAM_BOT_TOKEN', 'KB_TELEGRAM_CHAT_ID'],
            configuredEnv: [],
            missingEnv: ['KB_TELEGRAM_BOT_TOKEN', 'KB_TELEGRAM_CHAT_ID'],
            links: [],
            checklist: ['Criar ou reutilizar um bot do Telegram.'],
            warnings: ['Bot token do Telegram ausente.'],
          },
        ],
      });
    }
    if (url === '/api/notes/note-1') {
      return Response.json({
        ok: true,
        note: {
          ...dashboard.notes[0],
          markdown: '# Deploy rollout\n\n## Resumo\n\nRevisar deploy.',
          frontmatter: {},
          links: [],
          origin: 'vault',
        },
      });
    }
    if (url.startsWith('/api/query?')) {
      return Response.json({
        ok: true,
        mode: 'answer',
        query: 'deploy',
        matches: [{ path: '20 Inbox/note.md', title: 'Deploy rollout', projectSlug: 'n8n-automations', score: 10, snippet: 'deploy' }],
        answer: { answer: 'Encontrei 1 nota.', bullets: [], citedPaths: ['20 Inbox/note.md'] },
      });
    }
    return new Response(null, { status: 404 });
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AppShell', () => {
  it('renders dashboard data from the API and navigates with real routes', async () => {
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />);

    expect(await screen.findByRole('heading', { name: 'Home operacional' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Vault' }));
    fireEvent.click(await screen.findByText('Deploy rollout'));

    expect((await screen.findAllByRole('heading', { name: 'Deploy rollout' })).length).toBeGreaterThan(0);
    expect(await screen.findByText('20 Inbox/note.md')).toBeInTheDocument();
  });

  it('renders the home when the dashboard API does not include home aggregates yet', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/dashboard') {
        const { home: _home, ...legacyDashboard } = dashboard;
        return Response.json(legacyDashboard);
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<AppShell />);

    expect(await screen.findByRole('heading', { name: 'Home operacional' })).toBeInTheDocument();
    expect(await screen.findByText('Mudancas recentes')).toBeInTheDocument();
  });

  it('opens a note directly from a route parameter', async () => {
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />, { route: '/vault/note-1' });

    expect((await screen.findAllByRole('heading', { name: 'Deploy rollout' })).length).toBeGreaterThan(0);
    expect(await screen.findByText('20 Inbox/note.md')).toBeInTheDocument();
  });

  it('renders integration status from the settings route', async () => {
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />, { route: '/settings/integrations' });

    expect(await screen.findByRole('heading', { name: 'Integracoes' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'GitHub App' })).toBeInTheDocument();
    expect(screen.getByAltText('GitHub logo')).toBeInTheDocument();
    expect(screen.getByAltText('Telegram logo')).toBeInTheDocument();
    expect(screen.queryByText('KB_TELEGRAM_BOT_TOKEN')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes de Telegram' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('KB_TELEGRAM_BOT_TOKEN')).toBeInTheDocument();
    expect(await screen.findByText('Criar ou reutilizar um bot do Telegram.')).toBeInTheDocument();
  });

  it('shows login for anonymous users and loads the dashboard after auth', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard' && fetchMock.mock.calls.length === 1) {
        return new Response(null, { status: 401 });
      }
      if (url === '/api/auth/login') {
        return Response.json({ ok: true, user: { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user' } });
      }
      if (url === '/api/dashboard') {
        return Response.json(dashboard);
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAppProviders(<AppShell />);

    expect((await screen.findAllByRole('button', { name: 'Entrar' })).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'password123' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Entrar' }).at(-1)!);

    expect(await screen.findByRole('heading', { name: 'Home operacional' })).toBeInTheDocument();
  });
});
