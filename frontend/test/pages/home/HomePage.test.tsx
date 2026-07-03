import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { Dashboard } from '../../../src/shared/api/models/dashboard';
import { HomePage } from '../../../src/pages/home/HomePage';
import { GlobalLoadingProvider } from '../../../src/app/global-loading';
import { render } from '@testing-library/react';
import { HomePriorityType, HomeTargetKind } from '../../../src/shared/api/enums';

vi.mock('recharts', () => {
  const Chart = ({ children }: { children?: ReactNode }) => <div data-testid="chart">{children}</div>;
  const Element = () => <div />;
  return {
    Area: Element,
    AreaChart: Chart,
    Bar: Element,
    BarChart: Chart,
    CartesianGrid: Element,
    ResponsiveContainer: Chart,
    Tooltip: Element,
    XAxis: Element,
    YAxis: Element,
  };
});

const dashboard: Dashboard = {
  workspaces: [{ workspaceSlug: 'default', displayName: 'Default' }],
  projects: [
    {
      projectSlug: 'n8n-automations',
      displayName: 'N8N Automations',
      repositories: [{ id: '1', workspaceSlug: 'default', externalId: '0', fullName: 'acme/repo', htmlUrl: null, description: null, defaultBranch: null, createdAt: '', updatedAt: '' }],
      workspaceSlug: 'default',
      defaultTags: ['backend'],
      enabled: true,
      favorite: false,
    },
  ],
  notes: [
    {
      id: 'note-1',
      path: '20 Inbox/note.md',
      type: 'incident',
      title: 'Falha no deploy',
      project: 'n8n-automations',
      workspace: 'default',
      folderId: null,
      categories: [],
      tags: ['deploy'],
      date: '2026-04-27',
      status: 'active',
      summary: 'Deploy precisa de rollback.',
      source: 'test',
      attachmentCount: 0,
    },
  ],
  reminders: [],
  home: {
    windowDays: 7,
    metrics: [
      { id: 'recent-notes', label: 'Recent changes', value: 6, meta: 'notes in 7 days', tone: 'active' },
      { id: 'active-projects', label: 'Active projects', value: 1, meta: 'with recent movement', tone: 'active' },
      { id: 'open-reminders', label: 'Open reminders', value: 2, meta: '1 overdue', tone: 'high' },
      { id: 'open-findings', label: 'Open findings', value: 1, meta: '1 reviews with pending findings', tone: 'high' },
    ],
    activityByDay: [
      { date: '2026-04-21', label: '21/04', count: 0 },
      { date: '2026-04-22', label: '22/04', count: 1 },
      { date: '2026-04-23', label: '23/04', count: 0 },
      { date: '2026-04-24', label: '24/04', count: 1 },
      { date: '2026-04-25', label: '25/04', count: 1 },
      { date: '2026-04-26', label: '26/04', count: 2 },
      { date: '2026-04-27', label: '27/04', count: 1 },
    ],
    activityByProject: [{ project: 'n8n-automations', label: 'N8N Automations', count: 6 }],
    priorities: Array.from({ length: 6 }, (_, index) => ({
      id: `priority-${index}`,
      type: index === 0 ? HomePriorityType.Finding : HomePriorityType.Reminder,
      title: `Prioridade ${index + 1}`,
      project: 'n8n-automations',
      date: '2026-04-27',
      description: 'Resolver item aberto',
      severity: index === 0 ? 'high' : undefined,
      status: index === 0 ? undefined : 'pending',
      isOverdue: index === 0 ? false : true,
      reminderDate: index === 0 ? undefined : '2026-04-27',
      reminderTime: index === 0 ? undefined : '09:30',
      reminderAt: index === 0 ? undefined : '2026-04-27T12:30:00.000Z',
      target: index === 0 ? { kind: HomeTargetKind.Note, id: 'review-1', path: 'reviews/review.md' } : { kind: HomeTargetKind.Note, id: 'note-1', path: '20 Inbox/note.md' },
    })),
    recentInterestingEvents: [
      {
        id: 'note-1',
        category: 'manual',
        type: 'incident',
        title: 'Falha no deploy',
        project: 'n8n-automations',
        date: '2026-04-27',
        summary: 'Deploy precisa de rollback.',
        status: 'active',
        target: { kind: HomeTargetKind.Note, id: 'note-1', path: '20 Inbox/note.md' },
      },
    ],
  },
};

beforeEach(() => {
  // Mock localStorage
  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };
  vi.stubGlobal('localStorage', localStorageMock);

  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    calendar: 'gregory',
    locale: 'en-US',
    numberingSystem: 'latn',
    timeZone: 'America/Sao_Paulo',
  });

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/projects/timeline')) {
      return Response.json({
        ok: true,
        timeline: [
          {
            id: 'timeline-item-1',
            noteId: 'note-1',
            title: 'Falha no deploy',
            summary: 'Deploy precisa de rollback.',
            project: 'n8n-automations',
            workspace: 'default',
            folderId: null,
            type: 'incident',
            category: 'manual',
            status: 'active',
            source: 'test',
            sourceChannel: 'test',
            categories: [{ id: 'category-incident', name: 'incident' }],
            date: '2026-04-27',
            tags: ['deploy'],
            path: '20 Inbox/note.md',
            attachmentCount: 0,
          }
        ],
        pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
      });
    }
    if (url.includes('/api/integrations/github-app/backfill/status')) {
      return Response.json({ ok: false, status: 'not_found' });
    }
    if (url.includes('/api/integrations')) {
      return Response.json({
        ok: true,
        workspaceSlug: 'default',
        integrations: [],
        githubBackfillLimit: 5,
      });
    }
    if (url.includes('/api/notes')) {
      return Response.json({
        ok: true,
        notes: [],
        pagination: { page: 1, pageSize: 1, total: 0, totalPages: 0, hasNext: false, hasPrevious: false },
      });
    }
    if (url.includes('/api/reminders')) {
      return Response.json({
        ok: true,
        reminders: [],
        pagination: { page: 1, pageSize: 1, total: 0, totalPages: 0, hasNext: false, hasPrevious: false },
      });
    }
    return Response.error();
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderHome(overrides: Partial<Dashboard['home']> = {}, createNote = vi.fn()) {
  return renderHomeWithDashboard({ ...dashboard, home: { ...dashboard.home, ...overrides } }, createNote);
}

function renderHomeWithDashboard(inputDashboard: Dashboard, createNote = vi.fn()) {
  const openNote = vi.fn();
  const setSelectedProject = vi.fn();
  const openProject = vi.fn();
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  render(
    <GlobalLoadingProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <HomePage
            dashboard={inputDashboard}
            selectedProject="n8n-automations"
            selectedNoteId=""
            openNote={openNote}
            setSelectedProject={setSelectedProject}
            openProject={openProject}
            editNote={vi.fn()}
            deleteNote={vi.fn()}
            createNote={createNote}
          />
        </MemoryRouter>
      </QueryClientProvider>
    </GlobalLoadingProvider>,
  );
  return { openNote, openProject, createNote };
}

describe('HomePage', () => {
  it('renders operational KPIs, priorities and charts with capped lists', async () => {
    renderHome();

    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('Recent changes')).toBeInTheDocument();
    expect(screen.getByText('Prioridade 1')).toBeInTheDocument();

    const timelineHeading = await screen.findByRole('heading', { name: 'Project Activity Timeline' });
    expect(timelineHeading).toBeInTheDocument();

    const timelineItem = await screen.findByText('Falha no deploy');
    expect(timelineItem).toBeInTheDocument();

    const timelinePanel = timelineHeading.closest('.home-panel-timeline') as HTMLElement;
    expect(timelinePanel).toHaveTextContent('Test');
    expect(timelinePanel).toHaveTextContent('Incident');
    expect(timelinePanel).toHaveTextContent('Active');

    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getAllByText(/N8N Automations \/ 2026-04-27/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('Prioridade 6')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('chart')).toHaveLength(4);
  });

  it('navigates from review, note and project entries', async () => {
    const { openNote, openProject } = renderHome();

    const timelineEvent = await screen.findByText('Falha no deploy');
    expect(timelineEvent).toBeInTheDocument();

    fireEvent.click(screen.getByText('Prioridade 1'));
    fireEvent.click(timelineEvent);
    fireEvent.click(screen.getByRole('button', { name: /N8N Automations/i }));

    expect(openNote).toHaveBeenCalledWith('review-1');
    expect(openNote).toHaveBeenCalledWith('note-1');
    expect(openProject).toHaveBeenCalledWith('n8n-automations');
  });

  it('renders an empty state when there are no priorities', () => {
    renderHome({ priorities: [] });

    expect(screen.getByText('No open priorities in this window.')).toBeInTheDocument();
  });

  it('shows finding severity instead of the raw open status on dashboard priorities', () => {
    renderHome({
      priorities: [{
        id: 'finding-open',
        type: HomePriorityType.Finding,
        title: 'Review aberta',
        project: 'n8n-automations',
        date: '2026-04-27',
        description: 'Finding critico',
        severity: 'high',
        target: { kind: HomeTargetKind.Note, id: 'review-1', path: 'reviews/review.md' },
      }],
    });

    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.queryByText('open')).not.toBeInTheDocument();
  });

  it('shows the onboarding checklist when workspace is active', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/projects/timeline')) {
        return Response.json({
          ok: true,
          timeline: [],
          pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
        });
      }
      if (url.includes('/api/integrations')) {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          integrations: [
            { provider: 'github-app', name: 'GitHub App', description: 'GitHub', status: 'missing', workspaceSlug: 'default', publicMetadata: {}, primaryAction: null, steps: [], lastError: null, connectedAccount: null, updatedAt: null, revokedAt: null },
            { provider: 'whatsapp', name: 'WhatsApp', description: 'WhatsApp', status: 'missing', workspaceSlug: 'default', publicMetadata: {}, primaryAction: null, steps: [], lastError: null, connectedAccount: null, updatedAt: null, revokedAt: null },
          ],
          githubBackfillLimit: 5,
        });
      }
      if (url.includes('/api/notes')) {
        return Response.json({
          ok: true,
          notes: [],
          pagination: { page: 1, pageSize: 1, total: 0, totalPages: 0, hasNext: false, hasPrevious: false },
        });
      }
      if (url.includes('/api/reminders')) {
        return Response.json({
          ok: true,
          reminders: [],
          pagination: { page: 1, pageSize: 1, total: 0, totalPages: 0, hasNext: false, hasPrevious: false },
        });
      }
      return Response.error();
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHomeWithDashboard({
      ...dashboard,
      projects: dashboard.projects.map(p => ({ ...p, repositories: [] })),
    });

    expect(await screen.findByRole('heading', { name: 'Getting Started' })).toBeInTheDocument();
    expect(screen.getByText('Connect GitHub')).toBeInTheDocument();
    // WhatsApp is now in the collapsible "Optional integrations" section, not the main list.
    expect(screen.getByRole('button', { name: /optional integrations/i })).toBeInTheDocument();
    expect(screen.queryByText('Connect WhatsApp')).not.toBeInTheDocument();
  });

  it('calls createNote when the Quick note button is clicked', () => {
    const createNote = vi.fn();
    renderHome({}, createNote);

    const button = screen.getByRole('button', { name: 'Quick note' });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);

    expect(createNote).toHaveBeenCalled();
  });

  it('shows Make first push when GitHub is connected and has linked repo', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/projects/timeline')) {
        return Response.json({
          ok: true,
          timeline: [],
          pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
        });
      }
      if (url.includes('/api/integrations')) {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          integrations: [
            { provider: 'github-app', name: 'GitHub App', description: 'GitHub', status: 'connected', workspaceSlug: 'default', publicMetadata: {}, primaryAction: null, steps: [], lastError: null, connectedAccount: null, updatedAt: null, revokedAt: null },
            { provider: 'whatsapp', name: 'WhatsApp', description: 'WhatsApp', status: 'missing', workspaceSlug: 'default', publicMetadata: {}, primaryAction: null, steps: [], lastError: null, connectedAccount: null, updatedAt: null, revokedAt: null },
          ],
        });
      }
      if (url.includes('/api/notes')) {
        return Response.json({
          ok: true,
          notes: [],
          pagination: { page: 1, pageSize: 1, total: 0, totalPages: 0, hasNext: false, hasPrevious: false },
        });
      }
      if (url.includes('/api/reminders')) {
        return Response.json({
          ok: true,
          reminders: [],
          pagination: { page: 1, pageSize: 1, total: 0, totalPages: 0, hasNext: false, hasPrevious: false },
        });
      }
      return Response.error();
    });
    vi.stubGlobal('fetch', fetchMock);

    const testDashboard = {
      ...dashboard,
      home: {
        ...dashboard.home,
        metrics: [
          ...dashboard.home.metrics,
          { id: 'total-github-pushes', label: 'Total GitHub pushes', value: 0, meta: '', tone: 'active' },
        ],
      },
    };

    renderHomeWithDashboard(testDashboard);

    expect(await screen.findByRole('heading', { name: 'Getting Started' })).toBeInTheDocument();
    
    const connectGithubItem = screen.getByText('Connect GitHub').closest('.onboarding-item');
    expect(connectGithubItem).toHaveClass('done');

    // Expand optional items section to see "Make first push"
    const optionalToggle = screen.getByRole('button', { name: /Optional integrations/i });
    fireEvent.click(optionalToggle);

    const makeFirstPushItem = screen.getByText('Make first push').closest('.onboarding-item');
    expect(makeFirstPushItem).toBeInTheDocument();
    expect(makeFirstPushItem).not.toHaveClass('done');
  });

  it('marks Make first push as done when total-github-pushes is > 0', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/projects/timeline')) {
        return Response.json({
          ok: true,
          timeline: [],
          pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
        });
      }
      if (url.includes('/api/integrations')) {
        return Response.json({
          ok: true,
          workspaceSlug: 'default',
          integrations: [
            { provider: 'github-app', name: 'GitHub App', description: 'GitHub', status: 'connected', workspaceSlug: 'default', publicMetadata: {}, primaryAction: null, steps: [], lastError: null, connectedAccount: null, updatedAt: null, revokedAt: null },
            { provider: 'whatsapp', name: 'WhatsApp', description: 'WhatsApp', status: 'missing', workspaceSlug: 'default', publicMetadata: {}, primaryAction: null, steps: [], lastError: null, connectedAccount: null, updatedAt: null, revokedAt: null },
          ],
        });
      }
      if (url.includes('/api/notes')) {
        return Response.json({
          ok: true,
          notes: [],
          pagination: { page: 1, pageSize: 1, total: 0, totalPages: 0, hasNext: false, hasPrevious: false },
        });
      }
      if (url.includes('/api/reminders')) {
        return Response.json({
          ok: true,
          reminders: [],
          pagination: { page: 1, pageSize: 1, total: 0, totalPages: 0, hasNext: false, hasPrevious: false },
        });
      }
      return Response.error();
    });
    vi.stubGlobal('fetch', fetchMock);

    const testDashboard = {
      ...dashboard,
      home: {
        ...dashboard.home,
        metrics: [
          ...dashboard.home.metrics,
          { id: 'total-github-pushes', label: 'Total GitHub pushes', value: 1, meta: '', tone: 'active' },
        ],
      },
    };

    renderHomeWithDashboard(testDashboard);

    expect(await screen.findByRole('heading', { name: 'Getting Started' })).toBeInTheDocument();
    
    const connectGithubItem = screen.getByText('Connect GitHub').closest('.onboarding-item');
    expect(connectGithubItem).toHaveClass('done');

    // Expand optional items section to see "Make first push"
    const optionalToggle = screen.getByRole('button', { name: /Optional integrations/i });
    fireEvent.click(optionalToggle);

    const makeFirstPushItem = screen.getByText('Make first push').closest('.onboarding-item');
    expect(makeFirstPushItem).toHaveClass('done');
  });
});
