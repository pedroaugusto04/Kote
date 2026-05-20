import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import type { Dashboard } from '../../../src/shared/api/models/dashboard';
import { HomePage } from '../../../src/pages/home/HomePage';
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
      tags: ['deploy'],
      date: '2026-04-27',
      status: 'active',
      summary: 'Deploy precisa de rollback.',
      source: 'test',
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

afterEach(() => {
  cleanup();
});

function renderHome(overrides: Partial<Dashboard['home']> = {}) {
  return renderHomeWithDashboard({ ...dashboard, home: { ...dashboard.home, ...overrides } });
}

function renderHomeWithDashboard(inputDashboard: Dashboard) {
  const openNote = vi.fn();
  const setSelectedProject = vi.fn();
  const openProject = vi.fn();
  render(
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
      />
    </MemoryRouter>,
  );
  return { openNote, openProject };
}

describe('HomePage', () => {
  it('renders operational KPIs, priorities and charts with capped lists', () => {
    renderHome();

    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('Recent changes')).toBeInTheDocument();
    expect(screen.getByText('Prioridade 1')).toBeInTheDocument();
    const eventsPanel = screen.getByRole('heading', { name: 'Relevant recent events' }).closest('.home-panel-events') as HTMLElement;
    expect(eventsPanel).toHaveTextContent('manual');
    expect(eventsPanel).toHaveTextContent('incident');
    expect(eventsPanel).toHaveTextContent('active');
    expect(screen.getAllByText('pending').length).toBeGreaterThan(0);
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getAllByText(/N8N Automations \/ 04\/27\/2026 09:30/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('Prioridade 6')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('chart')).toHaveLength(4);
  });

  it('navigates from review, note and project entries', () => {
    const { openNote, openProject } = renderHome();

    fireEvent.click(screen.getByText('Prioridade 1'));
    fireEvent.click(screen.getByText('Falha no deploy'));
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

    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.queryByText('open')).not.toBeInTheDocument();
  });

  it('prompts users to connect integrations when GitHub repositories are not selected', () => {
    renderHomeWithDashboard({
      ...dashboard,
      projects: dashboard.projects.map(p => ({ ...p, repositories: [] })),
    });

    expect(screen.getByText('Finish setting up workspace integrations')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect integrations' })).toHaveAttribute('href', '/settings/integrations');
  });
});
