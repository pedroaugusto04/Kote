import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../src/app/test-utils';
import { AppShell } from '../../src/layouts/AppShell';

const notificationSpies = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
}));

vi.mock('../../src/shared/ui/notifications', () => ({
  NotificationsProvider: () => null,
  ...notificationSpies,
}));

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
    if (url === '/api/integrations?workspaceSlug=default') {
      return Response.json({
        ok: true,
        workspaceSlug: 'default',
        integrations: [
          {
            provider: 'github-app',
            name: 'GitHub App',
            description: 'Dados de instalacao do GitHub App vinculados ao usuario no workspace atual.',
            status: 'connected',
            workspaceSlug: 'default',
            publicMetadata: { label: 'GitHub principal' },
            primaryAction: { type: 'revoke', label: 'Revogar' },
            steps: ['Integracao conectada.'],
            lastError: null,
            connectedAccount: 'acme',
            updatedAt: '2026-04-27T10:00:00.000Z',
            revokedAt: null,
          },
          {
            provider: 'whatsapp',
            name: 'WhatsApp',
            description: 'Grupo autorizado para captura e conversa.',
            status: 'missing',
            workspaceSlug: 'default',
            publicMetadata: {},
            primaryAction: { type: 'connect', label: 'Conectar WhatsApp' },
            steps: ['Inicie a conexao.', 'Envie o codigo no grupo do WhatsApp.'],
            lastError: null,
            connectedAccount: null,
            updatedAt: null,
            revokedAt: null,
          },
          {
            provider: 'telegram',
            name: 'Telegram',
            description: 'Chat vinculado ao bot gerenciado.',
            status: 'missing',
            workspaceSlug: 'default',
            publicMetadata: {},
            primaryAction: { type: 'connect', label: 'Conectar Telegram' },
            steps: ['Inicie a conexao.', 'Envie o codigo no chat do Telegram.'],
            lastError: null,
            connectedAccount: null,
            updatedAt: null,
            revokedAt: null,
          },
          {
            provider: 'ai-review',
            name: 'IA de Review',
            description: 'Analise gerenciada de pushes.',
            status: 'missing',
            workspaceSlug: 'default',
            publicMetadata: {},
            primaryAction: { type: 'connect', label: 'Ativar' },
            steps: ['Ative o recurso.', 'A configuracao gerenciada do servidor sera usada automaticamente.'],
            lastError: null,
            connectedAccount: null,
            updatedAt: null,
            revokedAt: null,
          },
          {
            provider: 'ai-conversation',
            name: 'IA de Conversa',
            description: 'Extracao gerenciada de conversa.',
            status: 'missing',
            workspaceSlug: 'default',
            publicMetadata: {},
            primaryAction: { type: 'connect', label: 'Ativar' },
            steps: ['Ative o recurso.', 'A configuracao gerenciada do servidor sera usada automaticamente.'],
            lastError: null,
            connectedAccount: null,
            updatedAt: null,
            revokedAt: null,
          },
        ],
      });
    }
    if (url === '/api/integrations/whatsapp/connect') {
      return Response.json({
        ok: true,
        provider: 'whatsapp',
        session: { id: '11111111-1111-4111-8111-111111111111', provider: 'whatsapp', status: 'pending', workspaceSlug: 'default', expiresAt: '2026-04-27T10:10:00.000Z', consumedAt: null },
        verificationCode: 'ABC123',
        instruction: '/kb conectar ABC123',
        steps: ['Envie a mensagem no grupo.'],
      });
    }
    if (url === '/api/integrations/whatsapp/sessions/11111111-1111-4111-8111-111111111111') {
      return Response.json({
        ok: true,
        session: { id: '11111111-1111-4111-8111-111111111111', provider: 'whatsapp', status: 'connected', workspaceSlug: 'default', expiresAt: '2026-04-27T10:10:00.000Z', consumedAt: '2026-04-27T10:01:00.000Z', connectedAccount: '120363@g.us' },
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
  vi.clearAllMocks();
});

describe('AppShell', () => {
  it('renders dashboard data from the API and navigates with real routes', async () => {
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />);

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Vault' }));
    fireEvent.click(await screen.findByText('Deploy rollout'));

    expect((await screen.findAllByRole('heading', { name: 'Deploy rollout' })).length).toBeGreaterThan(0);
    expect(await screen.findByText('20 Inbox/note.md')).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Integrações' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'GitHub App' })).toBeInTheDocument();
    expect(screen.getByAltText('GitHub logo')).toBeInTheDocument();
    expect(screen.getByAltText('WhatsApp logo')).toBeInTheDocument();
    expect(screen.getByAltText('Telegram logo')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'IA de Review' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'IA de Conversa' })).toBeInTheDocument();
    expect(screen.getByText(/workspace default/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Conectar WhatsApp' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByLabelText('Codigo de conexao')).toHaveTextContent('ABC123');
    expect(await screen.findByText('/kb conectar ABC123')).toBeInTheDocument();
  });

  it('redirects authenticated users without workspace to the setup wizard', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return Response.json({
          ...dashboard,
          workspaces: [],
          projects: [],
          notes: [],
          reviews: [],
          reminders: [],
        });
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<AppShell />, { route: '/projects' });

    expect(await screen.findByRole('heading', { name: 'Configurar workspace' })).toBeInTheDocument();
  });

  it('keeps authenticated users in setup so they can finish optional integrations', async () => {
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />, { route: '/setup' });

    expect(await screen.findByRole('heading', { name: 'Configurar workspace' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Conectar GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Conectar WhatsApp ou Telegram' })).toBeInTheDocument();
  });

  it('opens the GitHub installation flow in a new tab', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return Response.json(dashboard);
      }
      if (url === '/api/integrations?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          integrations: [
            {
              provider: 'github-app',
              name: 'GitHub App',
              description: 'Dados de instalacao do GitHub App vinculados ao usuario no workspace atual.',
              status: 'missing',
              workspaceSlug: 'default',
              publicMetadata: {},
              primaryAction: { type: 'connect', label: 'Conectar GitHub' },
              steps: ['Instale o app.'],
              lastError: null,
              connectedAccount: null,
              updatedAt: null,
              revokedAt: null,
            },
          ],
        });
      }
      if (url === '/api/integrations/github-app/connect') {
        return Response.json({
          ok: true,
          provider: 'github-app',
          primaryAction: {
            type: 'external_redirect',
            label: 'Conectar GitHub',
            url: 'https://github.com/apps/kb/installations/new?state=test-state',
          },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(window);

    renderWithAppProviders(<AppShell />, { route: '/settings/integrations' });

    expect(await screen.findByRole('heading', { name: 'Integrações' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Conectar GitHub' }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        'https://github.com/apps/kb/installations/new?state=test-state',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('shows login for anonymous users and loads the dashboard after auth', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard' && fetchMock.mock.calls.length === 1) {
        return Response.json({
          ok: false,
          error: {
            code: 'missing_access_token',
            message: 'Nao autenticado.',
            details: {},
          },
          requestId: 'req-auth',
        }, {
          status: 401,
          headers: { 'x-request-id': 'req-auth' },
        });
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

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });

  it('does not retry dashboard requests after an anonymous 401', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return Response.json({
          ok: false,
          error: {
            code: 'missing_access_token',
            message: 'Nao autenticado.',
            details: {},
          },
          requestId: 'req-auth',
        }, {
          status: 401,
          headers: { 'x-request-id': 'req-auth' },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAppProviders(<AppShell />);

    expect((await screen.findAllByRole('button', { name: 'Entrar' })).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/dashboard')).toHaveLength(1);
    });
  });

  it('shows the backend auth error inline when login fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return Response.json({
          ok: false,
          error: {
            code: 'missing_access_token',
            message: 'Nao autenticado.',
            details: {},
          },
          requestId: 'req-auth',
        }, {
          status: 401,
          headers: { 'x-request-id': 'req-auth' },
        });
      }
      if (url === '/api/auth/login') {
        return Response.json({
          ok: false,
          error: {
            code: 'invalid_credentials',
            message: 'Email ou senha invalidos.',
            details: { fieldErrors: { email: 'Email ou senha invalidos.' } },
          },
          requestId: 'req-login',
        }, {
          status: 401,
          headers: { 'x-request-id': 'req-login' },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAppProviders(<AppShell />);

    expect((await screen.findAllByRole('button', { name: 'Entrar' })).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'password123' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Entrar' }).at(-1)!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Email ou senha invalidos.');
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus());
  });

  it('shows frontend auth validation before submitting', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return Response.json({
          ok: false,
          error: {
            code: 'missing_access_token',
            message: 'Nao autenticado.',
            details: {},
          },
          requestId: 'req-auth',
        }, {
          status: 401,
          headers: { 'x-request-id': 'req-auth' },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAppProviders(<AppShell />);

    expect((await screen.findAllByRole('button', { name: 'Entrar' })).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'email-invalido' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Entrar' }).at(-1)!);

    expect(await screen.findByText('Informe um email valido.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus());
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/auth/login')).toHaveLength(0);
  });

  it('shows duplicate signup email as a field error', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return Response.json({
          ok: false,
          error: {
            code: 'missing_access_token',
            message: 'Nao autenticado.',
            details: {},
          },
          requestId: 'req-auth',
        }, {
          status: 401,
          headers: { 'x-request-id': 'req-auth' },
        });
      }
      if (url === '/api/auth/signup') {
        return Response.json({
          ok: false,
          error: {
            code: 'email_already_registered',
            message: 'Email ja cadastrado.',
            details: { fieldErrors: { email: 'Este email ja esta cadastrado.' } },
          },
          requestId: 'req-signup',
        }, {
          status: 409,
          headers: { 'x-request-id': 'req-signup' },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAppProviders(<AppShell />);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Criar conta' })).at(0)!);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'User' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'password123' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Criar conta' }).at(-1)!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Este email ja esta cadastrado.');
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus());
  });
});
