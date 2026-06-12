import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { SearchPage } from '../../../src/pages/search/SearchPage';
import type { Dashboard } from '../../../src/shared/api/models/dashboard';
import type { NoteSummary } from '../../../src/shared/api/models/note';

const apiSpies = vi.hoisted(() => ({
  fetchAskHistory: vi.fn(),
  runAsk: vi.fn(),
  fetchLatestProjectBrief: vi.fn(),
  generateProjectBrief: vi.fn(),
}));

const notificationSpies = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
}));

vi.mock('../../../src/shared/api/client', () => ({
  fetchAskHistory: apiSpies.fetchAskHistory,
  runAsk: apiSpies.runAsk,
  fetchLatestProjectBrief: apiSpies.fetchLatestProjectBrief,
  generateProjectBrief: apiSpies.generateProjectBrief,
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
      projectSlug: 'platform',
      displayName: 'Platform',
      repositories: [],
      workspaceSlug: 'default',
      defaultTags: [],
      enabled: true,
      favorite: false,
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
  apiSpies.fetchAskHistory.mockReset();
  apiSpies.runAsk.mockReset();
  apiSpies.fetchLatestProjectBrief.mockReset();
  apiSpies.generateProjectBrief.mockReset();
  notificationSpies.notifyError.mockReset();
  notificationSpies.notifySuccess.mockReset();
  notificationSpies.notifyInfo.mockReset();
  notificationSpies.notifyWarning.mockReset();
  apiSpies.fetchAskHistory.mockResolvedValue({
    ok: true,
    history: [],
    pagination: { page: 1, pageSize: 5, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
  });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('SearchPage (Ask AI)', () => {
  it('passes the selected project to Ask AI requests', async () => {
    apiSpies.runAsk.mockResolvedValue({
      ok: true,
      answer: 'Use the **platform** rollout notes.',
      confidence: 'high',
      sources: [{ noteId: 'active-1', title: 'Active note', path: '20 Inbox/platform/note.md' }],
      relatedNotes: [],
    });

    const view = renderSearchPage('/search');

    const input = screen.getByPlaceholderText('Ask anything about your notes...');
    fireEvent.change(input, { target: { value: 'How should I deploy?' } });

    fireEvent.click(screen.getByLabelText('Filter by project'));
    fireEvent.click(screen.getByRole('option', { name: 'Platform' }));
    fireEvent.click(screen.getByRole('button', { name: /ask/i }));

    await waitFor(() => {
      expect(apiSpies.runAsk).toHaveBeenCalledWith({
        question: 'How should I deploy?',
        projectSlug: 'platform',
      });
    });
    await screen.findByText('Based on 1 source');
    expect(view.container.querySelector('.ask-answer-body strong')).toHaveTextContent('platform');
    expect(screen.getByRole('button', { name: 'Active note' })).toBeInTheDocument();
  });

  it('keeps Ask AI clickable and warns when there is no query', () => {
    renderSearchPage('/search');

    const askButton = screen.getByRole('button', { name: /ask/i });
    expect(askButton).toBeEnabled();

    fireEvent.click(askButton);

    expect(notificationSpies.notifyWarning).toHaveBeenCalledWith('Type something before asking AI.');
    expect(apiSpies.runAsk).not.toHaveBeenCalled();
  });

  it('shows Ask AI errors', async () => {
    apiSpies.runAsk.mockRejectedValue(new Error('AI unavailable'));

    renderSearchPage('/search');

    const input = screen.getByPlaceholderText('Ask anything about your notes...');
    fireEvent.change(input, { target: { value: 'deploy' } });
    fireEvent.click(screen.getByRole('button', { name: /ask/i }));

    expect(await screen.findByText('AI unavailable')).toBeInTheDocument();
  });

  it('opens inline Ask AI history and filters it by selected project', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: /show history/i }));

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
      pagination: { page: 1, pageSize: 5, total: 10, totalPages: 2, hasNext: true, hasPrevious: false },
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
      pagination: { page: 2, pageSize: 5, total: 10, totalPages: 2, hasNext: false, hasPrevious: true },
    });

    renderSearchPage('/search');

    fireEvent.click(screen.getByRole('button', { name: /show history/i }));
    expect(await screen.findByText('First answer.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    expect(await screen.findByText('Second answer.')).toBeInTheDocument();
    expect(apiSpies.fetchAskHistory).toHaveBeenCalledWith({ page: 2, pageSize: 5, projectSlug: '' });
  });

  it('selects a history item as the current answer', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /show history/i }));
    fireEvent.click(await screen.findByRole('button', { name: /how should i deploy/i }));

    // The text appears both in the history list and in the AI answer card
    expect(screen.getAllByText('Use the selected history answer.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Active note' })).toBeInTheDocument();
    expect(screen.getByText('Based on 1 source')).toBeInTheDocument();
  });

  it('renders the Project Brief panel', () => {
    renderSearchPage('/search');

    expect(screen.getByText('Project brief')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate brief/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show latest/i })).toBeInTheDocument();
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
