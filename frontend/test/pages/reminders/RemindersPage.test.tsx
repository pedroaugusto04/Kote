import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { RemindersPage } from '../../../src/pages/reminders/RemindersPage';
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
  vi.restoreAllMocks();
});

describe('RemindersPage', () => {
  it('requests reminders filtered by status and renders the backend status', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          ok: true,
          reminders: [
            {
              id: 'r1',
              title: 'Deploy',
              project: 'n8n-automations',
              workspace: 'default',
              status: 'pending',
              isOverdue: true,
              reminderDate: '2026-05-07',
              reminderTime: '09:00',
              reminderAt: '2026-05-07T09:00:00.000Z',
              relativePath: '20 Inbox/deploy.md',
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
        }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          ok: true,
          reminders: [
            {
              id: 'r2',
              title: 'Follow up',
              project: 'n8n-automations',
              workspace: 'default',
              status: 'sent',
              isOverdue: false,
              reminderDate: '2026-05-08',
              reminderTime: '10:00',
              reminderAt: '2026-05-08T10:00:00.000Z',
              relativePath: '20 Inbox/follow-up.md',
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
        }), { status: 200 }),
      );

    renderWithAppProviders(
      <RemindersPage
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

    expect(await screen.findByText('Deploy')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenNthCalledWith(1, '/api/reminders?page=1&pageSize=10&workspaceSlug=default&status=', expect.any(Object));

    fireEvent.click(screen.getByLabelText('Filter by status'));
    fireEvent.click(screen.getByRole('option', { name: 'Sent' }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenNthCalledWith(2, '/api/reminders?page=1&pageSize=10&workspaceSlug=default&status=sent', expect.any(Object));
    });
    expect(await screen.findByText('Follow up')).toBeInTheDocument();
    expect(screen.getAllByText('Sent').length).toBeGreaterThan(0);
  });

  it('keeps open reminders first and breaks ties by ascending date', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, reminders: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: false } }), { status: 200 }),
    );

    renderWithAppProviders(
      <RemindersPage
        dashboard={{
          ...dashboard,
          reminders: [
            {
              id: 'sent-earlier',
              title: 'Sent earlier',
              project: 'n8n-automations',
              workspace: 'default',
              status: 'sent',
              isOverdue: false,
              reminderDate: '2026-05-01',
              reminderTime: '08:00',
              reminderAt: '2026-05-01T08:00:00.000Z',
              relativePath: '20 Inbox/sent-earlier.md',
            },
            {
              id: 'pending-later',
              title: 'Pending later',
              project: 'n8n-automations',
              workspace: 'default',
              status: 'pending',
              isOverdue: false,
              reminderDate: '2026-05-03',
              reminderTime: '09:00',
              reminderAt: '2026-05-03T09:00:00.000Z',
              relativePath: '20 Inbox/pending-later.md',
            },
            {
              id: 'pending-earlier',
              title: 'Pending earlier',
              project: 'n8n-automations',
              workspace: 'default',
              status: 'pending',
              isOverdue: false,
              reminderDate: '2026-05-02',
              reminderTime: '09:00',
              reminderAt: '2026-05-02T09:00:00.000Z',
              relativePath: '20 Inbox/pending-earlier.md',
            },
          ],
        }}
        selectedProject=""
        selectedNoteId=""
        setSelectedProject={() => undefined}
        openProject={() => undefined}
        openNote={() => undefined}
        editNote={() => undefined}
        deleteNote={() => undefined}
      />,
    );

    const pendingEarlier = screen.getByText('Pending earlier');
    const pendingLater = screen.getByText('Pending later');
    const sentEarlier = screen.getByText('Sent earlier');

    expect(pendingEarlier.compareDocumentPosition(pendingLater) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pendingLater.compareDocumentPosition(sentEarlier) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
