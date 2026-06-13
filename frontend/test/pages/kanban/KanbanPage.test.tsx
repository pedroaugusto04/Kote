import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { KanbanPage } from '../../../src/pages/kanban/KanbanPage';
import type { Dashboard } from '../../../src/shared/api/models/dashboard';

const notificationSpies = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
}));

vi.mock('../../../src/shared/ui/notifications', async () => {
  const actual = await vi.importActual<typeof import('../../../src/shared/ui/notifications')>('../../../src/shared/ui/notifications');
  return {
    ...actual,
    ...notificationSpies,
  };
});

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
      favorite: false,
    },
    {
      projectSlug: 'ops',
      displayName: 'Ops',
      repositories: [],
      workspaceSlug: 'default',
      defaultTags: [],
      enabled: true,
      favorite: false,
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
  cleanup();
  vi.restoreAllMocks();
  Object.values(notificationSpies).forEach((spy) => spy.mockReset());
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
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      '/api/reminders/board?workspaceSlug=default&projectSlug=&limitPerColumn=5&overduePage=1&upcomingPage=1&resolvedPage=1&archivedPage=1',
      expect.any(Object)
    );

    fireEvent.click(screen.getByLabelText('Filter by project'));
    fireEvent.click(screen.getByRole('option', { name: 'Ops' }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        '/api/reminders/board?workspaceSlug=default&projectSlug=ops&limitPerColumn=5&overduePage=1&upcomingPage=1&resolvedPage=1&archivedPage=1',
        expect.any(Object)
      );
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

  it('blocks drops into the derived overdue column and shows a warning', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(boardResponse('Future deploy'));

    renderWithAppProviders(
      <KanbanPage
        dashboard={dashboard}
        selectedProject=""
        selectedNoteId=""
        setSelectedProject={() => undefined}
        openProject={() => undefined}
        openNote={() => undefined}
        editNote={() => undefined}
        deleteNote={() => undefined}
      />,
    );

    const card = await screen.findByText('Already sent');
    fireEvent.dragStart(card.closest('.kanban-card') as HTMLElement, {
      dataTransfer: dataTransferStub(),
    });
    fireEvent.drop(screen.getByLabelText('Overdue'), {
      dataTransfer: dataTransferStub(),
    });

    expect(notificationSpies.notifyWarning).toHaveBeenCalledWith('Reminders cannot be manually set to overdue.');
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/reminders/r2/status', expect.anything());
  });

  it('loads more items when clicking the Load more button', async () => {
    const page1Data = {
      ok: true,
      columns: {
        overdue: {
          items: Array.from({ length: 5 }, (_, i) => reminder(`Item ${i + 1}`, { id: `r${i + 1}` })),
          total: 8,
          page: 1,
          pageSize: 5,
          totalPages: 2,
          hasNext: true,
        },
        upcoming: { items: [], total: 0, page: 1, pageSize: 5, totalPages: 1, hasNext: false },
        resolved: { items: [], total: 0, page: 1, pageSize: 5, totalPages: 1, hasNext: false },
        archived: { items: [], total: 0, page: 1, pageSize: 5, totalPages: 1, hasNext: false },
      },
    };

    const page2Data = {
      ok: true,
      columns: {
        overdue: {
          items: Array.from({ length: 8 }, (_, i) => reminder(`Item ${i + 1}`, { id: `r${i + 1}` })),
          total: 8,
          page: 2,
          pageSize: 5,
          totalPages: 2,
          hasNext: false,
        },
        upcoming: { items: [], total: 0, page: 1, pageSize: 5, totalPages: 1, hasNext: false },
        resolved: { items: [], total: 0, page: 1, pageSize: 5, totalPages: 1, hasNext: false },
        archived: { items: [], total: 0, page: 1, pageSize: 5, totalPages: 1, hasNext: false },
      },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(page1Data), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page2Data), { status: 200 }));

    renderWithAppProviders(
      <KanbanPage
        dashboard={dashboard}
        selectedProject=""
        selectedNoteId=""
        setSelectedProject={() => undefined}
        openProject={() => undefined}
        openNote={() => undefined}
        editNote={() => undefined}
        deleteNote={() => undefined}
      />,
    );

    // Wait for page 1 items to appear
    expect(await screen.findByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 5')).toBeInTheDocument();
    expect(screen.queryByText('Item 6')).not.toBeInTheDocument();

    // The "Load more" button should be visible
    const loadMoreButton = screen.getByRole('button', { name: 'Load more' });
    expect(loadMoreButton).toBeInTheDocument();

    // Click Load more
    fireEvent.click(loadMoreButton);

    // Wait for page 2 items to appear
    await waitFor(() => {
      expect(screen.getByText('Item 6')).toBeInTheDocument();
    });

    // All items from both pages should be visible
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 5')).toBeInTheDocument();
    expect(screen.getByText('Item 8')).toBeInTheDocument();

    // Second fetch should include page 2 for overdue
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('overduePage=2'),
      expect.any(Object),
    );
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
