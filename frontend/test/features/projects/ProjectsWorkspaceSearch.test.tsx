import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { ProjectsWorkspace } from '../../../src/features/projects/ProjectsWorkspace';
import * as client from '../../../src/shared/api/client';
import * as integrations from '../../../src/shared/api/integrations';
import { createMockDashboard, createMockProject } from '../../fixtures/dashboard.fixture';

describe('ProjectsWorkspace Search Feedback', () => {
  const dashboard = createMockDashboard({
    projects: [
      createMockProject({ projectSlug: 'inbox', displayName: 'Inbox' }),
      createMockProject({ projectSlug: 'platform', displayName: 'Platform' }),
    ],
    notes: [],
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(integrations, 'fetchIntegrations').mockResolvedValue({
      ok: true,
      workspaceSlug: 'default',
      integrations: [],
    } as any);
    vi.spyOn(client, 'fetchAllProjectsTimeline').mockResolvedValue({
      ok: true,
      timeline: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
    } as any);
    vi.spyOn(client, 'fetchProjectFolders').mockResolvedValue({
      ok: true,
      projectSlug: 'platform',
      folders: [],
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows immediate search loading feedback while search is pending across all projects', async () => {
    let resolveQuery: (val: any) => void = () => {};
    const queryPromise = new Promise((resolve) => {
      resolveQuery = resolve;
    });

    vi.spyOn(client, 'runQuery').mockImplementation(() => queryPromise as any);

    renderWithAppProviders(
      <ProjectsWorkspace
        dashboard={dashboard}
        selectedProject=""
        openProject={vi.fn()}
        openNote={vi.fn()}
        editNote={vi.fn()}
        deleteNote={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText('Search across all projects');
    expect(searchInput).toBeInTheDocument();

    // Type a search query
    act(() => {
      fireEvent.change(searchInput, { target: { value: 'authentication' } });
    });

    // Immediately in search mode with pending status
    expect(screen.getByRole('heading', { level: 2, name: 'Search Results' })).toBeInTheDocument();
    expect(screen.getByText('Searching notes across all projects...')).toBeInTheDocument();
    expect(screen.getByLabelText('Searching notes...')).toBeInTheDocument();
    expect(screen.queryByText('No notes found for this search.')).not.toBeInTheDocument();

    // Clear button should be present
    const clearButton = screen.getByRole('button', { name: 'Clear search' });
    expect(clearButton).toBeInTheDocument();

    // Resolve search with results
    await act(async () => {
      resolveQuery({
        ok: true,
        matches: [
          {
            id: 'match-1',
            title: 'Auth Setup Guide',
            content: 'How OAuth works',
            project: 'platform',
            type: 'manual',
            status: 'open',
            occurredAt: '2026-03-01T10:00:00.000Z',
            tags: ['auth'],
          },
        ],
        pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Auth Setup Guide')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('Searching notes...')).not.toBeInTheDocument();

    // Clicking clear search resets input and returns to default view
    act(() => {
      fireEvent.click(clearButton);
    });

    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 2, name: 'Search Results' })).not.toBeInTheDocument();
      expect(searchInput).toHaveValue('');
    });
  });

  it('displays empty state only after search finishes with zero matches', async () => {
    let resolveQuery: (val: any) => void = () => {};
    const queryPromise = new Promise((resolve) => {
      resolveQuery = resolve;
    });

    vi.spyOn(client, 'runQuery').mockImplementation(() => queryPromise as any);

    renderWithAppProviders(
      <ProjectsWorkspace
        dashboard={dashboard}
        selectedProject=""
        openProject={vi.fn()}
        openNote={vi.fn()}
        editNote={vi.fn()}
        deleteNote={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText('Search across all projects');

    act(() => {
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });
    });

    // Loading indicator is visible while search is in flight
    expect(screen.getByText('Searching notes across all projects...')).toBeInTheDocument();
    expect(screen.queryByText('No notes found for this search.')).not.toBeInTheDocument();

    // Resolve query with 0 results
    await act(async () => {
      resolveQuery({
        ok: true,
        matches: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('No notes found for this search.')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('Searching notes...')).not.toBeInTheDocument();
  });

  it('shows project-specific searching messages when scoped to a selected project', async () => {
    let resolveQuery: (val: any) => void = () => {};
    const queryPromise = new Promise((resolve) => {
      resolveQuery = resolve;
    });

    vi.spyOn(client, 'runQuery').mockImplementation(() => queryPromise as any);
    vi.spyOn(client, 'fetchProjectTimeline').mockResolvedValue({
      ok: true,
      timeline: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
    } as any);

    renderWithAppProviders(
      <ProjectsWorkspace
        dashboard={dashboard}
        selectedProject="platform"
        openProject={vi.fn()}
        openNote={vi.fn()}
        editNote={vi.fn()}
        deleteNote={vi.fn()}
      />,
    );

    const searchInput = screen.getByPlaceholderText('Search in Platform...');
    expect(searchInput).toBeInTheDocument();

    act(() => {
      fireEvent.change(searchInput, { target: { value: 'api' } });
    });

    expect(screen.getByText('Searching in Platform...')).toBeInTheDocument();
    expect(screen.getByText('Searching notes in Platform...')).toBeInTheDocument();

    await act(async () => {
      resolveQuery({
        ok: true,
        matches: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('No notes found for this search.')).toBeInTheDocument();
    });
  });
});
