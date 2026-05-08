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
      aliases: ['n8n'],
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
      tags: ['deploy'],
      date: '2026-04-27',
      status: 'open',
      summary: 'Deploy precisa de rollback.',
      source: 'test',
    },
  ],
  reminders: [],
  home: {
    windowDays: 7,
    metrics: [
      { id: 'recent-notes', label: 'Mudancas recentes', value: 6, meta: 'notas em 7 dias', tone: 'active' },
      { id: 'active-projects', label: 'Projetos ativos', value: 1, meta: 'com movimento recente', tone: 'active' },
      { id: 'open-reminders', label: 'Lembretes abertos', value: 2, meta: '1 vencidos', tone: 'high' },
      { id: 'open-findings', label: 'Findings abertos', value: 1, meta: '1 reviews com pendencias', tone: 'high' },
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
      target: index === 0 ? { kind: HomeTargetKind.Note, id: 'review-1', path: 'reviews/review.md' } : { kind: HomeTargetKind.Note, id: 'note-1', path: '20 Inbox/note.md' },
    })),
    recentInterestingEvents: [
      {
        id: 'note-1',
        type: 'incident',
        title: 'Falha no deploy',
        project: 'n8n-automations',
        date: '2026-04-27',
        summary: 'Deploy precisa de rollback.',
        status: 'open',
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
  render(
    <MemoryRouter>
      <HomePage
        dashboard={inputDashboard}
        selectedProject="n8n-automations"
        selectedNoteId=""
        openNote={openNote}
        setSelectedProject={setSelectedProject}
        editNote={vi.fn()}
        deleteNote={vi.fn()}
      />
    </MemoryRouter>,
  );
  return { openNote, setSelectedProject };
}

describe('HomePage', () => {
  it('renders operational KPIs, priorities and charts with capped lists', () => {
    renderHome();

    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('Mudancas recentes')).toBeInTheDocument();
    expect(screen.getByText('Prioridade 1')).toBeInTheDocument();
    expect(screen.queryByText('Prioridade 6')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('chart')).toHaveLength(4);
  });

  it('navigates from review, note and project entries', () => {
    const { openNote, setSelectedProject } = renderHome();

    fireEvent.click(screen.getByText('Prioridade 1'));
    fireEvent.click(screen.getByText('Falha no deploy'));
    fireEvent.click(screen.getByRole('button', { name: /N8N Automations/i }));

    expect(openNote).toHaveBeenCalledWith('review-1');
    expect(openNote).toHaveBeenCalledWith('note-1');
    expect(setSelectedProject).toHaveBeenCalledWith('n8n-automations');
  });

  it('renders an empty state when there are no priorities', () => {
    renderHome({ priorities: [] });

    expect(screen.getByText('Nenhuma prioridade aberta nesta janela.')).toBeInTheDocument();
  });

  it('prompts users to connect integrations when GitHub repositories are not selected', () => {
    renderHomeWithDashboard({
      ...dashboard,
      projects: dashboard.projects.map(p => ({ ...p, repositories: [] })),
    });

    expect(screen.getByText('Finalize as integrações do workspace')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Conectar integrações' })).toHaveAttribute('href', '/settings/integrations');
  });
});
