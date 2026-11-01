import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as apiClient from '../../src/shared/api/client';
import { ProjectCommitsPanel } from '../../src/features/projects/ProjectCommitsPanel';
import { NoteLinkedCommitsPills } from '../../src/widgets/notes/NoteLinkedCommitsPills';

vi.mock('../../src/shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../src/shared/api/client')>('../../src/shared/api/client');
  return {
    ...actual,
    fetchProjectCommits: vi.fn(),
    linkNoteCommit: vi.fn(),
    unlinkNoteCommit: vi.fn(),
  };
});

function createQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('ProjectCommitsPanel and NoteLinkedCommitsPills', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders project commits, highlights commits with linked notes, and opens linked note on click', async () => {
    const onOpenNote = vi.fn();
    vi.mocked(apiClient.fetchProjectCommits).mockResolvedValue({
      ok: true,
      commits: [
        {
          id: 'commit-1',
          projectId: 'proj-1',
          projectSlug: 'kote',
          projectName: 'Kote',
          commitSha: '1111111222222233333334444444555555566666',
          shortSha: '1111111',
          message: 'feat(commits): link AI sessions to git commits',
          authorName: 'Pedro Duarte',
          authorEmail: 'pedro@example.com',
          committedAt: '2026-11-01T12:00:00.000Z',
          branch: 'main',
          changedFiles: ['src/commits.ts', 'src/notes.ts'],
          htmlUrl: 'https://github.com/org/kote/commit/1111111',
          linkedNotes: [
            {
              noteId: 'note-1',
              title: 'Session planning commit linkage',
              summary: 'Summary',
              source: 'claude-code',
              sourceChannel: 'ai-chat',
              occurredAt: '2026-11-01T11:55:00.000Z',
              linkSource: 'ai_terminal',
              confidence: 1,
              matchedFiles: ['src/commits.ts'],
            },
          ],
        },
        {
          id: 'commit-2',
          projectId: 'proj-1',
          projectSlug: 'kote',
          projectName: 'Kote',
          commitSha: 'aaaaaaa222222233333334444444555555566666',
          shortSha: 'aaaaaaa',
          message: 'chore: bump version',
          authorName: 'Pedro Duarte',
          authorEmail: 'pedro@example.com',
          committedAt: '2026-11-01T10:00:00.000Z',
          branch: 'main',
          changedFiles: ['package.json'],
          htmlUrl: null,
          linkedNotes: [],
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });

    const Wrapper = createQueryWrapper();
    render(
      <Wrapper>
        <ProjectCommitsPanel projectSlug="all" onOpenNote={onOpenNote} />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('feat(commits): link AI sessions to git commits')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('1 linked note')).toBeInTheDocument();
    expect(screen.getByText('Committed by AI')).toBeInTheDocument();
    expect(screen.getAllByText('Kote').length).toBeGreaterThan(0);
    expect(screen.getByText('commits.ts')).toBeInTheDocument();
    expect(screen.getByText('notes.ts')).toBeInTheDocument();
    expect(screen.getByText('package.json')).toBeInTheDocument();
    expect(screen.getByTitle('src/commits.ts')).toHaveClass('commit-file-chip');

    fireEvent.click(screen.getByText('Session planning commit linkage'));
    expect(onOpenNote).toHaveBeenCalledWith('note-1');

    fireEvent.click(screen.getByRole('button', { name: /AI Sessions/i }));
    await waitFor(() => {
      expect(apiClient.fetchProjectCommits).toHaveBeenCalledWith(
        'all',
        expect.objectContaining({ linkFilter: 'ai' }),
      );
    });
  });

  it('renders linked commit pills on a note and supports manual commit linking', async () => {
    vi.mocked(apiClient.fetchProjectCommits).mockResolvedValue({
      ok: true,
      commits: [
        {
          id: 'commit-2',
          projectId: 'proj-1',
          commitSha: 'bbbbbbb222222233333334444444555555566666',
          shortSha: 'bbbbbbb',
          message: 'fix: resolve edge case',
          authorName: 'Pedro',
          authorEmail: 'pedro@example.com',
          committedAt: '2026-11-01T11:00:00.000Z',
          branch: 'main',
          changedFiles: [],
          htmlUrl: null,
          linkedNotes: [],
        },
      ],
      pagination: {
        page: 1,
        pageSize: 15,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });
    vi.mocked(apiClient.linkNoteCommit).mockResolvedValue({
      ok: true,
      commit: {
        id: 'commit-2',
        commitSha: 'bbbbbbb222222233333334444444555555566666',
        shortSha: 'bbbbbbb',
        message: 'fix: resolve edge case',
        committedAt: '2026-11-01T11:00:00.000Z',
        authorName: 'Pedro',
        branch: 'main',
        htmlUrl: null,
        linkSource: 'manual',
        confidence: 1,
        matchedFiles: [],
      },
    });

    const Wrapper = createQueryWrapper();
    render(
      <Wrapper>
        <NoteLinkedCommitsPills
          noteId="note-1"
          projectSlug="kote"
          linkedCommits={[
            {
              id: 'commit-1',
              commitSha: '1111111222222233333334444444555555566666',
              shortSha: '1111111',
              message: 'feat(commits): link AI sessions',
              committedAt: '2026-11-01T12:00:00.000Z',
              authorName: 'Pedro',
              branch: 'main',
              htmlUrl: 'https://github.com/org/kote/commit/1111111',
              linkSource: 'session_files',
              confidence: 0.9,
              matchedFiles: ['src/commits.ts'],
            },
          ]}
        />
      </Wrapper>,
    );

    expect(screen.getByText('1111111')).toBeInTheDocument();
    expect(screen.getByText('feat(commits): link AI sessions')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /\+ Commit/i }));

    await waitFor(() => {
      expect(screen.getByText('fix: resolve edge case')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('fix: resolve edge case'));

    await waitFor(() => {
      expect(apiClient.linkNoteCommit).toHaveBeenCalledWith('note-1', 'commit-2');
    });
  });
});
