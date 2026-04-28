import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import type { Dashboard } from '../../shared/api/models/dashboard';
import { HomePage } from './HomePage';
import { render } from '@testing-library/react';

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
  workspaces: [{ workspaceSlug: 'default', displayName: 'Default', githubRepos: ['acme/repo'], projectSlugs: ['n8n-automations'] }],
  projects: [
    {
      projectSlug: 'n8n-automations',
      displayName: 'N8N Automations',
      repoFullName: 'acme/repo',
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
  reviews: [
    {
      id: 'review-1',
      title: 'Review critico',
      repo: 'acme/repo',
      project: 'n8n-automations',
      branch: 'main',
      date: '2026-04-27',
      status: 'open',
      summary: 'Review com finding.',
      impact: 'Alto',
      changedFiles: ['src/app.ts'],
      generatedNotePath: 'reviews/review.md',
      findings: [{ severity: 'high', file: 'src/app.ts', line: 10, summary: 'Corrigir validacao', recommendation: 'Ajustar', status: 'open' }],
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
      type: index === 0 ? ('finding' as const) : ('reminder' as const),
      title: `Prioridade ${index + 1}`,
      project: 'n8n-automations',
      date: '2026-04-27',
      description: 'Resolver item aberto',
      target: index === 0 ? { kind: 'review' as const, id: 'review-1' } : { kind: 'note' as const, id: 'note-1', path: '20 Inbox/note.md' },
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
        target: { kind: 'note', id: 'note-1', path: '20 Inbox/note.md' },
      },
    ],
  },
};

afterEach(() => {
  cleanup();
});

function renderHome(overrides: Partial<Dashboard['home']> = {}) {
  const openNote = vi.fn();
  const openReview = vi.fn();
  const setSelectedProject = vi.fn();
  render(
    <HomePage
      dashboard={{ ...dashboard, home: { ...dashboard.home, ...overrides } }}
      selectedProject="n8n-automations"
      selectedNoteId=""
      selectedReviewId=""
      openNote={openNote}
      openReview={openReview}
      setSelectedProject={setSelectedProject}
    />,
  );
  return { openNote, openReview, setSelectedProject };
}

describe('HomePage', () => {
  it('renders operational KPIs, priorities and charts with capped lists', () => {
    renderHome();

    expect(screen.getByRole('heading', { name: 'Home operacional' })).toBeInTheDocument();
    expect(screen.getByText('Mudancas recentes')).toBeInTheDocument();
    expect(screen.getByText('Prioridade 1')).toBeInTheDocument();
    expect(screen.queryByText('Prioridade 6')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('chart')).toHaveLength(4);
  });

  it('navigates from review, note and project entries', () => {
    const { openNote, openReview, setSelectedProject } = renderHome();

    fireEvent.click(screen.getByText('Prioridade 1'));
    fireEvent.click(screen.getByText('Falha no deploy'));
    fireEvent.click(screen.getByRole('button', { name: /N8N Automations/i }));

    expect(openReview).toHaveBeenCalledWith('review-1');
    expect(openNote).toHaveBeenCalledWith('note-1');
    expect(setSelectedProject).toHaveBeenCalledWith('n8n-automations');
  });

  it('renders an empty state when there are no priorities', () => {
    renderHome({ priorities: [] });

    expect(screen.getByText('Nenhuma prioridade aberta nesta janela.')).toBeInTheDocument();
  });
});
