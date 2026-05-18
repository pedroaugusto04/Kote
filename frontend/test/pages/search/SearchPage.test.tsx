import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { SearchPage } from '../../../src/pages/search/SearchPage';
import type { Dashboard } from '../../../src/shared/api/models/dashboard';
import type { NoteSummary } from '../../../src/shared/api/models/note';

const apiSpies = vi.hoisted(() => ({
  fetchNotes: vi.fn(),
  runQuery: vi.fn(),
}));

vi.mock('../../../src/shared/api/client', () => ({
  fetchNotes: apiSpies.fetchNotes,
  runQuery: apiSpies.runQuery,
}));

const dashboard: Dashboard = {
  workspaces: [{ workspaceSlug: 'default', displayName: 'Default' }],
  projects: [
    {
      projectSlug: 'platform',
      displayName: 'Platform',
      repositories: [],
      workspaceSlug: 'default',
      defaultTags: [],
      enabled: true,
    },
  ],
  notes: [
    buildNote({ id: 'active-1', title: 'Active note', status: 'active' }),
    buildNote({ id: 'resolved-1', title: 'Resolved note', status: 'resolved', path: '20 Inbox/platform/resolved.md' }),
  ],
  reminders: [],
  home: {
    windowDays: 7,
    metrics: [],
    activityByDay: [],
    activityByProject: [],
    priorities: [],
    recentInterestingEvents: [],
  },
};

beforeEach(() => {
  apiSpies.fetchNotes.mockReset();
  apiSpies.runQuery.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('SearchPage', () => {
  it('passes the selected status to text search requests', async () => {
    apiSpies.runQuery.mockResolvedValue({
      ok: true,
      matches: [buildNote({ id: 'resolved-2', title: 'Resolved deploy', status: 'resolved' })],
      pagination: { page: 1, pageSize: 5, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
      answer: { answer: 'ok', bullets: [] },
    });

    renderSearchPage('/search?q=deploy');

    fireEvent.click(screen.getByLabelText('Filter by status'));
    fireEvent.click(screen.getByRole('option', { name: 'Resolved' }));

    await waitFor(() => {
      expect(apiSpies.runQuery).toHaveBeenLastCalledWith({
        query: 'deploy',
        projectSlug: '',
        workspaceSlug: 'default',
        status: 'resolved',
        limit: 10,
        page: 1,
        pageSize: 5,
      });
    });
    expect(await screen.findByText('Resolved deploy')).toBeInTheDocument();
  });

  it('filters the note list by status when there is no search text', async () => {
    apiSpies.fetchNotes.mockResolvedValue({
      ok: true,
      notes: [buildNote({ id: 'resolved-2', title: 'Resolved follow-up', status: 'resolved' })],
      pagination: { page: 1, pageSize: 5, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
    });

    renderSearchPage('/search');

    fireEvent.click(screen.getByLabelText('Filter by status'));
    fireEvent.click(screen.getByRole('option', { name: 'Resolved' }));

    await waitFor(() => {
      expect(apiSpies.fetchNotes).toHaveBeenLastCalledWith({
        page: 1,
        workspaceSlug: 'default',
        projectSlug: '',
        status: 'resolved',
      });
    });
    expect(await screen.findByText('Resolved follow-up')).toBeInTheDocument();
  });
});

function renderSearchPage(route = '/search') {
  return renderWithAppProviders(
    <SearchPage
      dashboard={dashboard}
      selectedProject=""
      selectedNoteId=""
      setSelectedProject={vi.fn()}
      openProject={vi.fn()}
      openNote={vi.fn()}
      editNote={vi.fn()}
      deleteNote={vi.fn()}
    />,
    { route },
  );
}

function buildNote(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: 'note-1',
    path: '20 Inbox/platform/note.md',
    type: 'event',
    title: 'Note',
    project: 'platform',
    workspace: 'default',
    folderId: null,
    tags: [],
    date: '2026-05-01',
    status: 'active',
    summary: 'Summary',
    source: 'manual-api',
    attachmentCount: 0,
    ...overrides,
  };
}
