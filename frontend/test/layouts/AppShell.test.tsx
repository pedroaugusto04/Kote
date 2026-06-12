import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../src/app/test-utils';
import { THEME_STORAGE_KEY } from '../../src/app/providers/theme';
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
      repositories: [{ id: '1', workspaceSlug: 'default', externalId: '0', fullName: 'acme/repo', htmlUrl: null, description: null, defaultBranch: null, createdAt: '', updatedAt: '' }],
      workspaceSlug: 'default',
      defaultTags: ['backend', 'automation'],
      enabled: true,
      favorite: false,
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
      status: 'active',
      summary: 'Revisar deploy.',
      source: 'test',
    },
  ],
  reminders: [],
  home: {
    windowDays: 7,
    metrics: [
      { id: 'recent-notes', label: 'Recent changes', value: 1, meta: 'notes in 7 days', tone: 'active' },
      { id: 'active-projects', label: 'Active projects', value: 1, meta: 'with recent movement', tone: 'active' },
      { id: 'open-reminders', label: 'Open reminders', value: 0, meta: '0 overdue', tone: 'active' },
      { id: 'open-findings', label: 'Open findings', value: 0, meta: '0 reviews with pending findings', tone: 'active' },
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
        status: 'active',
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
    if (url === '/api/auth/me') {
      return Response.json({
        ok: true,
        user: { id: 'user-1', email: 'ada@example.com', displayName: 'Ada Lovelace', role: 'owner', avatarUrl: null },
      });
    }
    if (url === '/api/integrations?workspaceSlug=default') {
      return Response.json({
        ok: true,
        workspaceSlug: 'default',
        integrations: [
          {
            provider: 'github-app',
            name: 'GitHub App',
            description: 'GitHub App installation data linked to the current workspace user.',
            status: 'connected',
            workspaceSlug: 'default',
            publicMetadata: { label: 'Primary GitHub' },
            primaryAction: { type: 'revoke', label: 'Revoke' },
            steps: ['Integration connected.'],
            lastError: null,
            connectedAccount: 'acme',
            updatedAt: '2026-04-27T10:00:00.000Z',
            revokedAt: null,
          },
          {
            provider: 'whatsapp',
            name: 'WhatsApp',
            description: 'Authorized chat for capture and conversation.',
            status: 'missing',
            workspaceSlug: 'default',
            publicMetadata: {},
            primaryAction: { type: 'connect', label: 'Connect WhatsApp' },
            steps: ['Start the connection.', 'Send the code in the WhatsApp chat.'],
            lastError: null,
            connectedAccount: null,
            updatedAt: null,
            revokedAt: null,
          },
          {
            provider: 'telegram',
            name: 'Telegram',
            description: 'Chat linked to the managed bot.',
            status: 'missing',
            workspaceSlug: 'default',
            publicMetadata: {},
            primaryAction: { type: 'connect', label: 'Connect Telegram' },
            steps: ['Start the connection.', 'Send the code in the Telegram chat.'],
            lastError: null,
            connectedAccount: null,
            updatedAt: null,
            revokedAt: null,
          },
          {
            provider: 'ai-review',
            name: 'AI Review',
            description: 'Managed push analysis.',
            status: 'missing',
            workspaceSlug: 'default',
            publicMetadata: {},
            primaryAction: { type: 'connect', label: 'Enable' },
            steps: ['Enable the feature.', 'The managed server configuration will be used automatically.'],
            lastError: null,
            connectedAccount: null,
            updatedAt: null,
            revokedAt: null,
          },
          {
            provider: 'ai-conversation',
            name: 'AI Conversation',
            description: 'Managed conversation extraction.',
            status: 'missing',
            workspaceSlug: 'default',
            publicMetadata: {},
            primaryAction: { type: 'connect', label: 'Enable' },
            steps: ['Enable the feature.', 'The managed server configuration will be used automatically.'],
            lastError: null,
            connectedAccount: null,
            updatedAt: null,
            revokedAt: null,
          },
        ],
      });
    }
    if (url === '/api/integrations/github-app/repositories?workspaceSlug=default') {
      return Response.json({
        ok: true,
        workspaceSlug: 'default',
        repositories: dashboard.projects[0].repositories,
      });
    }
    if (url === '/api/integrations/whatsapp/connect') {
      return Response.json({
        ok: true,
        provider: 'whatsapp',
        session: { id: '11111111-1111-4111-8111-111111111111', provider: 'whatsapp', status: 'pending', workspaceSlug: 'default', expiresAt: '2026-04-27T10:10:00.000Z', consumedAt: null },
        verificationCode: 'ABC123',
        instruction: '/kb connect ABC123',
        steps: ['Envie a mensagem no chat.'],
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
          markdown:
            '---\n' +
            'id: "manual:note-1"\n' +
            'source_system: "manual-api"\n' +
            'project: "n8n-automations"\n' +
            '---\n\n' +
            '# Deploy rollout\n' +
            'Project: N8N Automations\n\n' +
            '## Original text\n\n' +
            'Revisar deploy.\n\n' +
            '## Summary\n\n' +
            'Revisar deploy.\n\n' +
            '## Impact\n\n' +
            'No impact registered.\n\n' +
            '## Risks\n\n' +
            '- none\n\n' +
            '## Next steps\n\n' +
            '- none',
          frontmatter: {},
          links: [],
          origin: 'vault',
        },
      });
    }
    if (url === '/api/projects/n8n-automations/folders') {
      return Response.json({ ok: true, projectSlug: 'n8n-automations', folders: [] });
    }
    if (url.startsWith('/api/projects/timeline') && url.includes('category=all')) {
      return Response.json({
        ok: true,
        timeline: dashboard.notes.map((note) => ({
          ...note,
          folderId: null,
          attachmentCount: 0,
          noteId: note.id,
          category: 'manual',
          sourceChannel: note.source,
        })),
        pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
      });
    }
    if (url === '/api/notes?page=1&pageSize=10&workspaceSlug=&projectSlug=n8n-automations&folderId=&status=&selectedId=') {
      return Response.json({
        ok: true,
        notes: dashboard.notes,
        pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
      });
    }
    if (url.startsWith('/api/query?')) {
      return Response.json({
        ok: true,
        query: 'deploy',
        pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
        matches: [{
          id: 'note-1',
          path: '20 Inbox/note.md',
          title: 'Deploy rollout',
          type: 'event',
          project: 'n8n-automations',
          workspace: 'default',
          tags: ['deploy'],
          date: '2026-04-27',
          status: 'active',
          summary: 'Revisar deploy.',
          source: 'test',
          projectSlug: 'n8n-automations',
          score: 10,
          snippet: 'deploy',
        }],
      });
    }
    return new Response(null, { status: 404 });
  });
}

function mockUnauthorizedDashboardFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === '/api/dashboard') {
      return Response.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return new Response(null, { status: 404 });
  });
}

function stubMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn((_event: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === 'function') {
        listeners.add(listener as unknown as (event: MediaQueryListEvent) => void);
      }
    }),
    removeEventListener: vi.fn((_event: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === 'function') {
        listeners.delete(listener as unknown as (event: MediaQueryListEvent) => void);
      }
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } satisfies MediaQueryList;

  const matchMedia = vi.fn().mockImplementation(() => mediaQueryList);
  vi.stubGlobal('matchMedia', matchMedia);

  return {
    matchMedia,
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches: nextMatches, media: mediaQueryList.media } as MediaQueryListEvent;
      for (const listener of listeners) listener(event);
    },
  };
}

function stubLocalStorage() {
  const store = new Map<string, string>();
  const localStorageMock = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  };

  vi.stubGlobal('localStorage', localStorageMock);
  return localStorageMock;
}

beforeEach(() => {
  stubLocalStorage();
});

afterEach(() => {
  cleanup();
  const storage = globalThis.localStorage;
  if (storage && typeof storage.clear === 'function') {
    storage.clear();
  }
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = '';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('AppShell', () => {
  it('shows the global loading overlay during the initial blocking dashboard bootstrap', async () => {
    stubLocalStorage();
    const deferred = (() => {
      let resolve!: (value: Response) => void;
      const promise = new Promise<Response>((resolver) => {
        resolve = resolver;
      });
      return { promise, resolve };
    })();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/dashboard') {
        return deferred.promise;
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAppProviders(<AppShell />);

    const overlay = (await screen.findByText('Loading')).closest('.global-loading-overlay');
    expect(overlay).toHaveClass('global-loading-overlay');
    expect(screen.getByText('Loading')).toHaveClass('sr-only');

    deferred.resolve(Response.json(dashboard));

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector('.global-loading-overlay')).toBeNull();
    });
  });

  it('renders dashboard data from the API and navigates with real routes', async () => {
    stubLocalStorage();
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />);

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    fireEvent.click(await screen.findByText('Deploy rollout'));

    expect((await screen.findAllByRole('heading', { name: 'Deploy rollout' })).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('N8N Automations')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Event')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Active')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Deploy')).toBeInTheDocument();
    expect(screen.getAllByText('Revisar deploy.').length).toBeGreaterThan(0);
    const noteReader = document.querySelector('.note-reader');
    expect(noteReader).not.toBeNull();
    expect(within(noteReader as HTMLElement).getAllByText('Revisar deploy.')).toHaveLength(1);
    expect(screen.queryByText('20 Inbox/note.md')).not.toBeInTheDocument();
    expect(screen.queryByText('test')).not.toBeInTheDocument();
    expect(screen.queryByText(/source_system/)).not.toBeInTheDocument();
    expect(screen.queryByText(/manual-api/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Project:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Original text')).not.toBeInTheDocument();
    expect(screen.queryByText('No impact registered.')).not.toBeInTheDocument();
    expect(screen.queryByText('- none')).not.toBeInTheDocument();
  });

  it('uses dark mode by default when there is no saved theme', async () => {
    const storage = stubLocalStorage();
    stubMatchMedia(true);
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />);

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('ignores the system light preference and uses dark mode by default when there is no saved theme', async () => {
    const storage = stubLocalStorage();
    stubMatchMedia(false);
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />);

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('renders the theme toggle immediately before the sign out button', async () => {
    stubLocalStorage();
    stubMatchMedia(true);
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />);

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();

    const topbarMeta = document.querySelector('.topbar-meta');
    expect(topbarMeta).not.toBeNull();

    const buttons = topbarMeta ? Array.from(topbarMeta.querySelectorAll('button')) : [];
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAttribute('aria-label', 'User menu');
    expect(buttons[1]).toHaveAttribute('aria-label', 'Enable light mode');
    expect(buttons[2]).toHaveTextContent('Sign out');
  });

  it('persists the selected theme and reapplies it on a new render', async () => {
    const storage = stubLocalStorage();
    stubMatchMedia(true);
    vi.stubGlobal('fetch', mockFetch());

    const firstRender = renderWithAppProviders(<AppShell />);

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Enable light mode' }));

    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('button', { name: 'Enable dark mode' })).toBeInTheDocument();

    firstRender.unmount();

    renderWithAppProviders(<AppShell />);

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('button', { name: 'Enable dark mode' })).toBeInTheDocument();
  });

  it('blocks note navigation with the global loading overlay until the note detail is ready', async () => {
    stubLocalStorage();
    const deferred = (() => {
      let resolve!: (value: Response) => void;
      const promise = new Promise<Response>((resolver) => {
        resolve = resolver;
      });
      return { promise, resolve };
    })();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return Promise.resolve(Response.json(dashboard));
      }
      if (url === '/api/notes/note-1') {
        return deferred.promise;
      }
      if (url === '/api/integrations?workspaceSlug=default') {
        return Promise.resolve(Response.json({ ok: true, workspaceSlug: 'default', integrations: [] }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    }));

    renderWithAppProviders(<AppShell />);

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    fireEvent.click(await screen.findByText('Deploy rollout'));

    const overlay = (await screen.findByText('Loading')).closest('.global-loading-overlay');
    expect(overlay).toHaveClass('global-loading-overlay');
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(document.querySelector('.note-reader')).toBeNull();

    deferred.resolve(Response.json({
      ok: true,
      note: {
        ...dashboard.notes[0],
        folderId: null,
        attachmentCount: 0,
        markdown: '# Deploy rollout\n\nRevisar deploy.',
        frontmatter: {},
        links: [],
        origin: 'vault',
        attachments: [],
        editor: null,
      },
    }));

    expect((await screen.findAllByRole('heading', { name: 'Deploy rollout' })).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(document.querySelector('.global-loading-overlay')).toBeNull();
    });
  });

  it('opens a note directly from a route parameter', async () => {
    stubLocalStorage();
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />, { route: '/vault/note-1' });

    expect((await screen.findAllByRole('heading', { name: 'Deploy rollout' })).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Event')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Active')).length).toBeGreaterThan(0);
    expect(screen.queryByText('20 Inbox/note.md')).not.toBeInTheDocument();
  });

  it('shows the public landing page at the root route when the session is missing', async () => {
    stubLocalStorage();
    vi.stubGlobal('fetch', mockUnauthorizedDashboardFetch());

    renderWithAppProviders(<AppShell />);

    expect(await screen.findByRole('heading', { name: 'Your team writes the code. Let us capture the context.' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Enter workspace' })[0]).toHaveAttribute('href', '/auth');
    expect(screen.queryByLabelText('Authentication')).not.toBeInTheDocument();
  });

  it('shows the auth page directly on /auth when the session is missing', async () => {
    stubLocalStorage();
    vi.stubGlobal('fetch', mockUnauthorizedDashboardFetch());

    renderWithAppProviders(<AppShell />, { route: '/auth?mode=signup' });

    expect(await screen.findByRole('heading', { name: 'Create your knowledge base' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('redirects protected routes to /auth when the session is missing', async () => {
    stubLocalStorage();
    vi.stubGlobal('fetch', mockUnauthorizedDashboardFetch());

    renderWithAppProviders(<AppShell />, { route: '/projects' });

    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/');
  });

  it('opens the protected profile route from the user menu', async () => {
    stubLocalStorage();
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />);

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'My Profile' }));

    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'User menu' })).toHaveClass('active');
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('owner')).toBeInTheDocument();
    expect(screen.getAllByText('Default').length).toBeGreaterThan(0);
    expect(screen.getAllByText('default').length).toBeGreaterThan(0);
  });

  it('moves integrations from the sidebar into the user menu', async () => {
    stubLocalStorage();
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />);

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Main sections' })).queryByRole('link', { name: 'Integrations' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
    const integrationsLink = await screen.findByRole('menuitem', { name: 'Integrations' });
    expect(integrationsLink).toHaveAttribute('href', '/settings/integrations');

    fireEvent.click(integrationsLink);

    expect(await screen.findByRole('heading', { name: 'Integrations' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'User menu' })).toHaveClass('active');
  });

  it('updates the topbar avatar after changing the profile photo', async () => {
    stubLocalStorage();
    let avatarUrl: string | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return Response.json(dashboard);
      }
      if (url === '/api/auth/me') {
        return Response.json({
          ok: true,
          user: { id: 'user-1', email: 'ada@example.com', displayName: 'Ada Lovelace', role: 'owner', avatarUrl },
        });
      }
      if (url === '/api/auth/avatar' && init?.method === 'PUT') {
        avatarUrl = '/api/auth/avatar/content?v=2';
        return Response.json({
          ok: true,
          user: { id: 'user-1', email: 'ada@example.com', displayName: 'Ada Lovelace', role: 'owner', avatarUrl },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAppProviders(<AppShell />, { route: '/profile' });

    expect(await screen.findByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'User menu' })).toHaveTextContent('AL');
    });

    const file = new File(['avatar'], 'avatar.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText('Change photo'), { target: { files: [file] } });

    await waitFor(() => {
      const image = screen.getByRole('button', { name: 'User menu' }).querySelector('img');
      expect(image).toHaveAttribute('src', '/api/auth/avatar/content?v=2');
    });
  });

  it('shows only the search results list without the old answer panel', async () => {
    stubLocalStorage();
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />, { route: '/search?q=deploy' });

    expect(await screen.findByRole('heading', { name: 'Search' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Answer' })).not.toBeInTheDocument();
    expect(screen.queryByText('20 Inbox/note.md')).not.toBeInTheDocument();
    expect(await screen.findByText('Deploy rollout')).toBeInTheDocument();
  });

  it('switches to the projects menu when selecting a project from another section', async () => {
    stubLocalStorage();
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />, { route: '/search?q=deploy' });

    expect(await screen.findByRole('heading', { name: 'Search' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /N8N Automations/ }));

    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Main sections' })).getByRole('link', { name: 'Projects' })).toHaveClass('active');
  });

  it('shows All in the projects select and lists notes from every project', async () => {
    stubLocalStorage();
    const allProjectsDashboard = {
      ...dashboard,
      projects: [
        dashboard.projects[0],
        {
          projectSlug: 'platform',
          displayName: 'Platform',
          repositories: [],
          workspaceSlug: 'default',
          defaultTags: ['platform'],
          enabled: true,
          favorite: false,
        },
      ],
      notes: [
        {
          ...dashboard.notes[0],
          folderId: null,
          attachmentCount: 0,
        },
        {
          id: 'note-2',
          path: '20 Inbox/platform.md',
          type: 'knowledge',
          title: 'Platform decision',
          project: 'platform',
          workspace: 'default',
          folderId: null,
          tags: ['platform'],
          date: '2026-04-28',
          status: 'active',
          summary: 'Document platform rollout.',
          source: 'manual',
          attachmentCount: 0,
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return Response.json(allProjectsDashboard);
      }
      if (url === '/api/integrations?workspaceSlug=default') {
        return Response.json({ ok: true, workspaceSlug: 'default', integrations: [] });
      }
      if (url.startsWith('/api/projects/timeline') && url.includes('category=all')) {
        return Response.json({
          ok: true,
          timeline: allProjectsDashboard.notes.map((note) => ({
            ...note,
            noteId: note.id,
            category: 'manual',
            sourceChannel: note.source,
          })),
          pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1, hasNext: false, hasPrevious: false },
        });
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<AppShell />, { route: '/projects' });

    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByLabelText('Select project')).toHaveTextContent('All');
    fireEvent.click(screen.getByLabelText('Select project'));
    expect(screen.getByRole('option', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByText('Deploy rollout')).toBeInTheDocument();
    expect(screen.getByText('Platform decision')).toBeInTheDocument();
  });

  it('navigates to home when clicking the brand section', async () => {
    stubLocalStorage();
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />, { route: '/vault/note-1' });

    expect((await screen.findAllByRole('heading', { name: 'Deploy rollout' })).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('link', { name: 'Go to Home' }));

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });

  it('opens and closes the mobile navigation drawer without breaking routing', async () => {
    stubLocalStorage();
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />);

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();

    const menuButton = screen.getByRole('button', { name: 'menu' });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(menuButton);
    fireEvent.click(screen.getByRole('link', { name: 'Projects' }));

    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    await waitFor(() => {
      expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('renders integration status from the settings route', async () => {
    stubLocalStorage();
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />, { route: '/settings/integrations' });

    expect(await screen.findByRole('heading', { name: 'Integrations' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'GitHub App' })).toBeInTheDocument();
    expect(screen.getByAltText('GitHub logo')).toBeInTheDocument();
    expect(screen.getByAltText('WhatsApp logo')).toBeInTheDocument();
    expect(screen.getByAltText('Telegram logo')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'AI Review' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'AI Conversation' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Current workspace: default' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Connect WhatsApp' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByLabelText('Connection code')).toHaveTextContent('ABC123');
    expect(await screen.findByText('/kb connect ABC123')).toBeInTheDocument();
  });

  it('redirects authenticated users without workspace to the setup wizard', async () => {
    stubLocalStorage();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return Response.json({
          ...dashboard,
          workspaces: [],
          projects: [],
          notes: [],
          reminders: [],
        });
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<AppShell />, { route: '/projects' });

    expect(await screen.findByRole('heading', { name: 'Set up workspace' })).toBeInTheDocument();
  });

  it('renders projects routes even when dashboard notes are omitted', async () => {
    stubLocalStorage();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return Response.json({
          ...dashboard,
          notes: undefined,
        });
      }
      if (url === '/api/projects?page=1&pageSize=10&selectedSlug=n8n-automations') {
        return Response.json({
          ok: true,
          projects: dashboard.projects,
          pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
        });
      }
      if (url === '/api/projects/n8n-automations/folders') {
        return Response.json({ ok: true, projectSlug: 'n8n-automations', folders: [] });
      }
      if (url.startsWith('/api/projects/timeline') && url.includes('category=all')) {
        return Response.json({
          ok: true,
          timeline: [],
          pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
        });
      }
      if (url === '/api/notes?page=1&pageSize=10&workspaceSlug=&projectSlug=n8n-automations&folderId=&status=&selectedId=') {
        return Response.json({
          ok: true,
          notes: [],
          pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
        });
      }
      if (url === '/api/integrations?workspaceSlug=default') {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          integrations: [],
        });
      }
      return new Response(null, { status: 404 });
    }));

    renderWithAppProviders(<AppShell />, { route: '/projects' });

    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByLabelText('Select project')).toHaveTextContent('All');
  });

  it('keeps authenticated users in setup so they can finish optional integrations', async () => {
    vi.stubGlobal('fetch', mockFetch());

    renderWithAppProviders(<AppShell />, { route: '/setup' });

    expect(await screen.findByRole('heading', { name: 'Set up workspace' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Connect GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Connect WhatsApp or Telegram' })).toBeInTheDocument();
  });

  it('opens the GitHub installation flow in the same tab', async () => {
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
              description: 'GitHub App installation data linked to the current workspace user.',
              status: 'missing',
              workspaceSlug: 'default',
              publicMetadata: {},
              primaryAction: { type: 'connect', label: 'Connect GitHub' },
              steps: ['Install the app.'],
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
            label: 'Connect GitHub',
            url: 'https://github.com/apps/kb/installations/new?state=test-state',
          },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const originalLocation = window.location;
    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: assignSpy },
    });

    renderWithAppProviders(<AppShell />, { route: '/settings/integrations' });

    expect(await screen.findByRole('heading', { name: 'Integrations' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Connect GitHub' }));

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith('https://github.com/apps/kb/installations/new?state=test-state');
    });

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
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
            message: 'Not authenticated.',
            details: {},
          },
          requestId: 'req-auth',
        }, {
          status: 401,
          headers: { 'x-request-id': 'req-auth' },
        });
      }
      if (url === '/api/auth/refresh') {
        return Response.json({
          ok: false,
          error: {
            code: 'invalid_refresh_token',
            message: 'Refresh expired.',
            details: {},
          },
          requestId: 'req-refresh',
        }, {
          status: 401,
          headers: { 'x-request-id': 'req-refresh' },
        });
      }
      if (url === '/api/auth/logout') {
        return Response.json({ ok: true });
      }
      if (url === '/api/auth/login') {
        return Response.json({ ok: true, user: { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user', avatarUrl: null } });
      }
      if (url === '/api/dashboard') {
        return Response.json(dashboard);
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAppProviders(<AppShell />);

    expect(await screen.findByRole('heading', { name: 'Your team writes the code. Let us capture the context.' })).toBeInTheDocument();
    expect(screen.getByText('Keep notes, WhatsApp & Telegram logs, GitHub PR reviews, decisions, and reminders unified. Turn unstructured engineering chat into searchable context.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'With Knowledge Vault, you don\'t need to guess.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Semantic Search & AI Assistant' })).toBeInTheDocument();
    expect(screen.getByText('Context & Evidence')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth');
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/auth?mode=signup');

    fireEvent.click(screen.getByRole('link', { name: 'Create account' }));

    expect(await screen.findByRole('heading', { name: 'Create your knowledge base' })).toBeInTheDocument();
    expect(screen.getByText('Start capturing the technical context your future self will need.')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' }).at(-1)!);

    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' }).at(-1)!);

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
            message: 'Not authenticated.',
            details: {},
          },
          requestId: 'req-auth',
        }, {
          status: 401,
          headers: { 'x-request-id': 'req-auth' },
        });
      }
      if (url === '/api/auth/refresh') {
        return Response.json({
          ok: false,
          error: {
            code: 'invalid_refresh_token',
            message: 'Refresh expired.',
            details: {},
          },
          requestId: 'req-refresh',
        }, {
          status: 401,
          headers: { 'x-request-id': 'req-refresh' },
        });
      }
      if (url === '/api/auth/logout') {
        return Response.json({ ok: true });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAppProviders(<AppShell />, { route: '/auth' });

    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/dashboard')).toHaveLength(1);
    });
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/auth/refresh')).toHaveLength(1);
  });

  it('shows the backend auth error inline when login fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return Response.json({
          ok: false,
          error: {
            code: 'missing_access_token',
            message: 'Not authenticated.',
            details: {},
          },
          requestId: 'req-auth',
        }, {
          status: 401,
          headers: { 'x-request-id': 'req-auth' },
        });
      }
      if (url === '/api/auth/refresh') {
        return Response.json({
          ok: false,
          error: {
            code: 'invalid_refresh_token',
            message: 'Refresh expired.',
            details: {},
          },
          requestId: 'req-refresh',
        }, {
          status: 401,
          headers: { 'x-request-id': 'req-refresh' },
        });
      }
      if (url === '/api/auth/logout') {
        return Response.json({ ok: true });
      }
      if (url === '/api/auth/login') {
        return Response.json({
          ok: false,
          error: {
            code: 'invalid_credentials',
            message: 'Invalid email or password.',
            details: { fieldErrors: { email: 'Invalid email or password.' } },
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

    renderWithAppProviders(<AppShell />, { route: '/auth' });

    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' }).at(-1)!);

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
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
            message: 'Not authenticated.',
            details: {},
          },
          requestId: 'req-auth',
        }, {
          status: 401,
          headers: { 'x-request-id': 'req-auth' },
        });
      }
      if (url === '/api/auth/refresh') {
        return Response.json({
          ok: false,
          error: {
            code: 'invalid_refresh_token',
            message: 'Refresh expired.',
            details: {},
          },
          requestId: 'req-refresh',
        }, {
          status: 401,
          headers: { 'x-request-id': 'req-refresh' },
        });
      }
      if (url === '/api/auth/logout') {
        return Response.json({ ok: true });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAppProviders(<AppShell />, { route: '/auth' });

    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'email-invalido' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' }).at(-1)!);

    expect(await screen.findByText('Enter a valid email.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus());
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === '/api/auth/login')).toHaveLength(0);
  });

  it('starts Google auth with a top-level redirect to the API start endpoint', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return Response.json({
          ok: false,
          error: { code: 'missing_access_token', message: 'Not authenticated.', details: {} },
          requestId: 'req-auth',
        }, { status: 401 });
      }
      if (url === '/api/auth/refresh') {
        return Response.json({
          ok: false,
          error: { code: 'invalid_refresh_token', message: 'Refresh expired.', details: {} },
          requestId: 'req-refresh',
        }, { status: 401 });
      }
      if (url === '/api/auth/logout') return Response.json({ ok: true });
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const originalLocation = window.location;
    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: assignSpy },
    });

    renderWithAppProviders(<AppShell />, { route: '/auth?mode=signup' });

    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));

    expect(assignSpy).toHaveBeenCalledWith('/api/auth/google/start?returnTo=%2Fauth%3Fmode%3Dsignup');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('shows Google callback errors on the auth page', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return Response.json({
          ok: false,
          error: { code: 'missing_access_token', message: 'Not authenticated.', details: {} },
          requestId: 'req-auth',
        }, { status: 401 });
      }
      if (url === '/api/auth/refresh') {
        return Response.json({
          ok: false,
          error: { code: 'invalid_refresh_token', message: 'Refresh expired.', details: {} },
          requestId: 'req-refresh',
        }, { status: 401 });
      }
      if (url === '/api/auth/logout') return Response.json({ ok: true });
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithAppProviders(<AppShell />, { route: '/auth?error=google_auth_failed' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not finish Google sign-in. Try again.');
  });

  it('shows duplicate signup email as a field error', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/dashboard') {
        return Response.json({
          ok: false,
          error: {
            code: 'missing_access_token',
            message: 'Not authenticated.',
            details: {},
          },
          requestId: 'req-auth',
        }, {
          status: 401,
          headers: { 'x-request-id': 'req-auth' },
        });
      }
      if (url === '/api/auth/refresh') {
        return Response.json({
          ok: false,
          error: {
            code: 'invalid_refresh_token',
            message: 'Refresh expired.',
            details: {},
          },
          requestId: 'req-refresh',
        }, {
          status: 401,
          headers: { 'x-request-id': 'req-refresh' },
        });
      }
      if (url === '/api/auth/logout') {
        return Response.json({ ok: true });
      }
      if (url === '/api/auth/signup') {
        return Response.json({
          ok: false,
          error: {
            code: 'email_already_registered',
            message: 'Email already registered.',
            details: { fieldErrors: { email: 'This email is already registered.' } },
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

    renderWithAppProviders(<AppShell />, { route: '/auth' });

    expect(await screen.findByRole('heading', { name: 'Sign in to your workspace' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Create account' }).at(-1)!);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'User' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Create account' }).at(-1)!);

    expect(await screen.findByRole('alert')).toHaveTextContent('This email is already registered.');
    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus());
  });
});
