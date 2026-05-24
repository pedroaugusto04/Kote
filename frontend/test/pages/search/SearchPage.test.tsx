import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
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
  updateNote: vi.fn(),
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
    pagination: { page: 1, pageSize: 5, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
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

    const input = screen.getByPlaceholderText('Search or ask anything...');
    fireEvent.change(input, { target: { value: 'd' } });
    fireEvent.change(input, { target: { value: 'de' } });
    fireEvent.change(input, { target: { value: 'dep' } });

    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=dep');

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
      answer: 'Use the **platform** rollout notes.',
      confidence: 'high',
      sources: [{ noteId: 'active-1', title: 'Active note', path: '20 Inbox/platform/note.md' }],
      relatedNotes: [],
    });

    const view = renderSearchPage('/search?q=How%20should%20I%20deploy%3F');

    fireEvent.click(screen.getByLabelText('Filter by project'));
    fireEvent.click(screen.getByRole('option', { name: 'Platform' }));
    fireEvent.click(screen.getByRole('button', { name: /ask ai/i }));

    await waitFor(() => {
      expect(apiSpies.runAsk).toHaveBeenCalledWith({
        question: 'How should I deploy?',
        projectSlug: 'platform',
      });
    });
    await screen.findByText('Based on 1 source');
    expect(view.container.querySelector('.ask-answer-body strong')).toHaveTextContent('platform');
    expect(screen.getByRole('button', { name: 'Active note' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide answer' }));
    expect(view.container.querySelector('.ask-answer-body')).not.toBeInTheDocument();
    expect(apiSpies.fetchAskHistory).not.toHaveBeenCalled();
  });

  it('disables Ask AI until there is a query', () => {
    renderSearchPage('/search');

    expect(screen.getByRole('button', { name: /ask ai/i })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Search or ask anything...'), { target: { value: 'deploy' } });

    expect(screen.getByRole('button', { name: /ask ai/i })).toBeEnabled();
  });

  it('shows Ask AI errors without clearing matching notes', async () => {
    apiSpies.runQuery.mockResolvedValue({
      ok: true,
      matches: [buildNote({ id: 'deploy-1', title: 'Deploy rollout' })],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
      answer: { answer: 'ok', bullets: [] },
    });
    apiSpies.runAsk.mockRejectedValue(new Error('AI unavailable'));

    renderSearchPage('/search?q=deploy');

    expect(await screen.findByText('Deploy rollout')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ask ai/i }));

    expect(await screen.findByText('AI unavailable')).toBeInTheDocument();
    expect(screen.getByText('Deploy rollout')).toBeInTheDocument();
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
      pagination: { page: 1, pageSize: 5, total: 6, totalPages: 2, hasNext: true, hasPrevious: false },
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
      pagination: { page: 1, pageSize: 5, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
    });

    renderSearchPage('/search');

    expect(apiSpies.fetchAskHistory).not.toHaveBeenCalled();
    expect(screen.queryByText('Use the rollout notes.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(await screen.findByText('Use the rollout notes.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Filter by project'));
    fireEvent.click(screen.getByRole('option', { name: 'Platform' }));

    expect(await screen.findByText('Deploy platform from staging.')).toBeInTheDocument();
    expect(apiSpies.fetchAskHistory).toHaveBeenCalledWith({ page: 1, pageSize: 5, projectSlug: '' });
    expect(apiSpies.fetchAskHistory).toHaveBeenCalledWith({ page: 1, pageSize: 5, projectSlug: 'platform' });
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
      pagination: { page: 1, pageSize: 5, total: 6, totalPages: 2, hasNext: true, hasPrevious: false },
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
      pagination: { page: 2, pageSize: 5, total: 6, totalPages: 2, hasNext: false, hasPrevious: true },
    });

    renderSearchPage('/search');

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText('First answer.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    expect(await screen.findByText('Second answer.')).toBeInTheDocument();
    expect(apiSpies.fetchAskHistory).toHaveBeenCalledWith({ page: 2, pageSize: 5, projectSlug: '' });
  });

  it('selects a history item as the current answer and closes the popover', async () => {
    apiSpies.fetchAskHistory.mockResolvedValueOnce({
      ok: true,
      history: [{
        id: 'ask-1',
        question: 'How should I deploy?',
        answer: 'Use the selected history answer.',
        confidence: 'high',
        projectSlug: '',
        sources: [{ noteId: 'active-1', title: 'Active note', path: '20 Inbox/platform/note.md' }],
        relatedNotes: [],
        createdAt: '2026-05-23T10:00:00.000Z',
      }],
      pagination: { page: 1, pageSize: 5, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
    });

    renderSearchPage('/search');

    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.click(await screen.findByRole('button', { name: /how should i deploy/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Use the selected history answer.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active note' })).toBeInTheDocument();
    expect(screen.getByText('Based on 1 source')).toBeInTheDocument();
  });
});

function renderSearchPage(route = '/search') {
  return renderWithAppProviders(
    <>
      <SearchPage
        dashboard={dashboard}
        selectedProject=""
        selectedNoteId=""
        setSelectedProject={vi.fn()}
        openProject={vi.fn()}
        openNote={vi.fn()}
        editNote={vi.fn()}
        deleteNote={vi.fn()}
      />
      <LocationProbe />
    </>,
    { route },
  );
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
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
