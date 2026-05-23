import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { SearchPage } from '../../../src/pages/search/SearchPage';
import type { Dashboard } from '../../../src/shared/api/models/dashboard';
import type { NoteSummary } from '../../../src/shared/api/models/note';

const apiSpies = vi.hoisted(() => ({
  fetchNotes: vi.fn(),
  fetchAskHistory: vi.fn(),
  runQuery: vi.fn(),
  runAsk: vi.fn(),
}));

vi.mock('../../../src/shared/api/client', () => ({
  fetchAskHistory: apiSpies.fetchAskHistory,
  fetchNotes: apiSpies.fetchNotes,
  runQuery: apiSpies.runQuery,
  runAsk: apiSpies.runAsk,
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
  apiSpies.fetchAskHistory.mockReset();
  apiSpies.runQuery.mockReset();
  apiSpies.runAsk.mockReset();
  apiSpies.fetchAskHistory.mockResolvedValue({
    ok: true,
    history: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
  });
  apiSpies.fetchNotes.mockResolvedValue({
    ok: true,
    notes: dashboard.notes,
    pagination: { page: 1, pageSize: 10, total: dashboard.notes.length, totalPages: 1, hasNext: false, hasPrevious: false },
  });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('SearchPage', () => {
  it('debounces backend search requests while the user types', async () => {
    vi.useFakeTimers();
    apiSpies.fetchNotes.mockResolvedValue({
      ok: true,
      notes: dashboard.notes,
      pagination: { page: 1, pageSize: 10, total: dashboard.notes.length, totalPages: 1, hasNext: false, hasPrevious: false },
    });
    apiSpies.runQuery.mockResolvedValue({
      ok: true,
      matches: [buildNote({ id: 'deploy-1', title: 'Deploy rollout' })],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
      answer: { answer: 'ok', bullets: [] },
    });

    renderSearchPage('/search');

    const input = screen.getByPlaceholderText('Enter what you are looking for...');
    fireEvent.change(input, { target: { value: 'd' } });
    fireEvent.change(input, { target: { value: 'de' } });
    fireEvent.change(input, { target: { value: 'dep' } });

    await act(async () => {
      vi.advanceTimersByTime(349);
      await Promise.resolve();
    });

    expect(apiSpies.runQuery).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(apiSpies.runQuery).toHaveBeenCalledTimes(1);
    expect(apiSpies.runQuery).toHaveBeenLastCalledWith({
      query: 'dep',
      projectSlug: '',
      workspaceSlug: 'default',
      status: '',
      limit: 10,
      page: 1,
      pageSize: 10,
    });
  });

  it('passes the selected status to text search requests', async () => {
    apiSpies.runQuery.mockResolvedValue({
      ok: true,
      matches: [buildNote({ id: 'resolved-2', title: 'Resolved deploy', status: 'resolved' })],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
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
        pageSize: 10,
      });
    });
    expect(await screen.findByText('Resolved deploy')).toBeInTheDocument();
  });

  it('filters the note list by status when there is no search text', async () => {
    apiSpies.fetchNotes.mockResolvedValue({
      ok: true,
      notes: [buildNote({ id: 'resolved-2', title: 'Resolved follow-up', status: 'resolved' })],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
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

  it('passes the selected project to Ask AI requests', async () => {
    apiSpies.runAsk.mockResolvedValue({
      ok: true,
      answer: 'Use the platform rollout notes.',
      confidence: 'high',
      sources: [],
      relatedNotes: [],
    });

    renderSearchPage('/search');

    fireEvent.click(screen.getByRole('button', { name: /ask ai/i }));
    fireEvent.click(screen.getByLabelText('Filter Ask AI by project'));
    fireEvent.click(screen.getByRole('option', { name: 'Platform' }));
    fireEvent.change(screen.getByPlaceholderText('Ask a question about your knowledge...'), {
      target: { value: 'How should I deploy?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() => {
      expect(apiSpies.runAsk).toHaveBeenCalledWith({
        question: 'How should I deploy?',
        projectSlug: 'platform',
      });
    });
    expect(await screen.findByText('Use the platform rollout notes.')).toBeInTheDocument();
    expect(apiSpies.fetchAskHistory).not.toHaveBeenCalled();
  });

  it('opens paginated Ask AI history from a button and filters it by selected project', async () => {
    apiSpies.fetchAskHistory.mockResolvedValueOnce({
      ok: true,
      history: [{
        id: 'ask-1',
        question: 'How should I deploy?',
        answer: 'Use the rollout notes.',
        confidence: 'high',
        projectSlug: '',
        sources: [{ noteId: 'active-1', title: 'Active note', path: '20 Inbox/platform/note.md' }],
        relatedNotes: [],
        createdAt: '2026-05-23T10:00:00.000Z',
      }],
      pagination: { page: 1, pageSize: 10, total: 6, totalPages: 2, hasNext: true, hasPrevious: false },
    }).mockResolvedValueOnce({
      ok: true,
      history: [{
        id: 'ask-2',
        question: 'Platform deploy?',
        answer: 'Deploy platform from staging.',
        confidence: 'medium',
        projectSlug: 'platform',
        sources: [],
        relatedNotes: [],
        createdAt: '2026-05-23T11:00:00.000Z',
      }],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
    });

    renderSearchPage('/search');

    fireEvent.click(screen.getByRole('button', { name: /ask ai/i }));
    expect(screen.queryByText('Use the rollout notes.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show history' }));

    expect(await screen.findByText('Use the rollout notes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active note' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Filter Ask AI by project'));
    fireEvent.click(screen.getByRole('option', { name: 'Platform' }));

    expect(await screen.findByText('Deploy platform from staging.')).toBeInTheDocument();
    expect(apiSpies.fetchAskHistory).toHaveBeenCalledWith({ page: 1, pageSize: 10, projectSlug: '' });
    expect(apiSpies.fetchAskHistory).toHaveBeenCalledWith({ page: 1, pageSize: 10, projectSlug: 'platform' });
  });

  it('uses Ask AI history pagination controls', async () => {
    apiSpies.fetchAskHistory.mockResolvedValueOnce({
      ok: true,
      history: [{
        id: 'ask-1',
        question: 'First page?',
        answer: 'First answer.',
        confidence: 'high',
        projectSlug: '',
        sources: [],
        relatedNotes: [],
        createdAt: '2026-05-23T10:00:00.000Z',
      }],
      pagination: { page: 1, pageSize: 10, total: 6, totalPages: 2, hasNext: true, hasPrevious: false },
    }).mockResolvedValueOnce({
      ok: true,
      history: [{
        id: 'ask-2',
        question: 'Second page?',
        answer: 'Second answer.',
        confidence: 'low',
        projectSlug: '',
        sources: [],
        relatedNotes: [],
        createdAt: '2026-05-23T09:00:00.000Z',
      }],
      pagination: { page: 2, pageSize: 10, total: 6, totalPages: 2, hasNext: false, hasPrevious: true },
    });

    renderSearchPage('/search');

    fireEvent.click(screen.getByRole('button', { name: /ask ai/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Show history' }));
    expect(await screen.findByText('First answer.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    expect(await screen.findByText('Second answer.')).toBeInTheDocument();
    expect(apiSpies.fetchAskHistory).toHaveBeenCalledWith({ page: 2, pageSize: 10, projectSlug: '' });
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
