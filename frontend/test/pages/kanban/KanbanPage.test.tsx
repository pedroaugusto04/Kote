import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { KanbanPage } from '../../../src/pages/kanban/KanbanPage';
import type { Dashboard } from '../../../src/shared/api/models/dashboard';

const dashboard: Dashboard = {
  workspaces: [{ workspaceSlug: 'default', displayName: 'Default' }],
  projects: [
    {
      projectSlug: 'n8n-automations',
      displayName: 'N8N Automations',
      repositories: [],
      workspaceSlug: 'default',
      defaultTags: [],
      enabled: true,
    },
    {
      projectSlug: 'ops',
      displayName: 'Ops',
      repositories: [],
      workspaceSlug: 'default',
      defaultTags: [],
      enabled: true,
    },
  ],
  home: {
    windowDays: 7,
    metrics: [],
    activityByDay: [],
    activityByProject: [],
    priorities: [],
    recentInterestingEvents: [],
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('KanbanPage', () => {
  it('renders board columns, filters by project, drags status changes and opens notes', async () => {
    const openNote = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(boardResponse('Overdue deploy'))
      .mockResolvedValueOnce(boardResponse('Ops deploy'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, id: 'r1', status: 'resolved' }), { status: 200 }))
      .mockResolvedValue(boardResponse('After update'));

    renderWithAppProviders(
      <KanbanPage
        dashboard={dashboard}
        selectedProject=""
        selectedNoteId=""
        setSelectedProject={() => undefined}
        openProject={() => undefined}
        openNote={openNote}
        editNote={() => undefined}
        deleteNote={() => undefined}
      />,
    );

    expect(await screen.findByText('Overdue deploy')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Overdue' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Upcoming' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Resolved' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Archived' })).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenNthCalledWith(1, '/api/reminders/board?workspaceSlug=default&projectSlug=&limitPerColumn=50', expect.any(Object));

    fireEvent.click(screen.getByLabelText('Filter by project'));
    fireEvent.click(screen.getByRole('option', { name: 'Ops' }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenNthCalledWith(2, '/api/reminders/board?workspaceSlug=default&projectSlug=ops&limitPerColumn=50', expect.any(Object));
    });

    const card = await screen.findByText('Ops deploy');
    fireEvent.click(card);
    expect(openNote).toHaveBeenCalledWith('r1');

    fireEvent.dragStart(card.closest('.kanban-card') as HTMLElement, {
      dataTransfer: dataTransferStub(),
    });
    fireEvent.drop(screen.getByLabelText('Resolved'), {
      dataTransfer: dataTransferStub(),
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/reminders/r1/status', expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
        body: JSON.stringify({ status: 'resolved' }),
      }));
    });
  });
});

function boardResponse(title: string) {
  return new Response(JSON.stringify({
    ok: true,
    columns: {
      overdue: {
        items: [reminder(title)],
        total: 2,
      },
      upcoming: {
        items: [reminder('Already sent', { id: 'r2', status: 'sent', isOverdue: false })],
        total: 1,
      },
      resolved: { items: [], total: 0 },
      archived: { items: [], total: 0 },
    },
  }), { status: 200 });
}

function reminder(title: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    title,
    noteText: 'Review the deployment window.',
    project: 'n8n-automations',
    workspace: 'default',
    status: 'pending',
    isOverdue: true,
    reminderDate: '2026-05-07',
    reminderTime: '09:00',
    reminderAt: '2026-05-07T09:00:00.000Z',
    relativePath: '20 Inbox/deploy.md',
    ...overrides,
  };
}

function dataTransferStub() {
  return {
    effectAllowed: '',
    setData: vi.fn(),
    getData: vi.fn(),
  };
}
