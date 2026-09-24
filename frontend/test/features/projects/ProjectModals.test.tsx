import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';

import { ProjectNoteModal } from '../../../src/features/projects/modals/ProjectNoteModal';
import { ProjectModal } from '../../../src/features/projects/modals/ProjectModal';
import { WorkspaceModalMode } from '../../../src/features/projects/projects.types';

vi.mock('../../../src/app/global-loading', () => ({
  useGlobalLoading: () => ({
    trackPromise: <T,>(p: Promise<T>) => p,
  }),
}));

vi.mock('../../../src/shared/api/client', () => ({
  createNote: vi.fn().mockResolvedValue({ noteId: 'new-note-1' }),
  updateNote: vi.fn().mockResolvedValue({ noteId: 'edit-note-1' }),
  createProject: vi.fn().mockResolvedValue({ project: { projectSlug: 'new-proj' } }),
  updateProject: vi.fn().mockResolvedValue({ project: { projectSlug: 'edit-proj' } }),
  fetchProjectFolders: vi.fn().mockResolvedValue({ folders: [] }),
  fetchWorkspaceCategories: vi.fn().mockResolvedValue([
    { id: 'cat-1', name: 'Work', color: '#38bdf8' },
    { id: 'cat-2', name: 'Personal', color: '#fb923c' },
  ]),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('ProjectNoteModal (Quick Note UX)', () => {
  it('renders capture-first fields (Title, Text, and Attachments) and collapsed metadata toolbar in Create mode', () => {
    renderWithClient(
      <ProjectNoteModal
        mode={WorkspaceModalMode.Create}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        projectSlug="default-project"
        workspaceSlug="default-ws"
      />
    );

    // Title and Text are immediately visible
    expect(screen.getByPlaceholderText(/Note title/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Write note content in Markdown/i)).toBeInTheDocument();

    // Attachments field is immediately visible
    expect(screen.getByLabelText(/Upload files/i)).toBeInTheDocument();

    // Metadata toggle buttons are visible
    expect(screen.getByTitle('Toggle categories')).toBeInTheDocument();
    expect(screen.getByTitle('Toggle tags')).toBeInTheDocument();
    expect(screen.getByTitle('Toggle reminder')).toBeInTheDocument();

    // Secondary inputs start collapsed
    expect(screen.queryByPlaceholderText(/Add tags/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Reminder/i)).not.toBeInTheDocument();
  });

  it('expands optional sections upon clicking toolbar buttons', async () => {
    renderWithClient(
      <ProjectNoteModal
        mode={WorkspaceModalMode.Create}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        projectSlug="default-project"
        workspaceSlug="default-ws"
      />
    );

    // Click on tags toggle
    fireEvent.click(screen.getByTitle('Toggle tags'));
    expect(screen.getByPlaceholderText(/Add tags/i)).toBeInTheDocument();

    // Click on reminder toggle
    fireEvent.click(screen.getByTitle('Toggle reminder'));
    expect(screen.getByLabelText(/Reminder/i)).toBeInTheDocument();
  });

  it('keeps metadata sections open if note already has tags or reminder in Edit mode', async () => {
    renderWithClient(
      <ProjectNoteModal
        mode={WorkspaceModalMode.Edit}
        note={{
          id: 'note-1',
          title: 'Existing Note',
          project: 'default-project',
          tags: ['react', 'ux'],
          categories: [{ id: 'cat-1', name: 'Work' }],
          editor: {
            rawText: 'Hello world',
            reminderAt: '2026-10-01T10:00:00Z',
          },
          attachments: [],
        } as any}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        projectSlug="default-project"
        workspaceSlug="default-ws"
      />
    );

    // Tags and categories are pre-expanded
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('ux')).toBeInTheDocument();
    expect(await screen.findByText('Work')).toBeInTheDocument();
  });
});

describe('ProjectModal (New Project UX)', () => {
  it('renders Name, Slug, and GitHub repositories directly with collapsed default tags toolbar in Create mode', () => {
    renderWithClient(
      <ProjectModal
        githubConnected={true}
        mode={WorkspaceModalMode.Create}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        workspaceRepositories={[
          {
            id: 'repo-1',
            fullName: 'org/my-repo',
            name: 'my-repo',
            owner: 'org',
            htmlUrl: 'https://github.com/org/my-repo',
            description: null,
            defaultBranch: null,
            private: false,
            selected: false,
          },
        ]}
      />
    );

    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Slug/i)).toBeInTheDocument();

    // GitHub repositories is visible by default
    expect(screen.getByText('org/my-repo')).toBeInTheDocument();

    // Default tags toggle button is visible, but tag input is collapsed
    expect(screen.getByTitle('Toggle default tags')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Type and press Enter to add tags/i)).not.toBeInTheDocument();

    // Clicking default tags toggle opens tag input
    fireEvent.click(screen.getByTitle('Toggle default tags'));
    expect(screen.getByPlaceholderText(/Type and press Enter to add tags/i)).toBeInTheDocument();
  });

  it('keeps default tags section open in Edit mode when project has default tags', () => {
    renderWithClient(
      <ProjectModal
        githubConnected={true}
        mode={WorkspaceModalMode.Edit}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        project={{
          projectSlug: 'existing-proj',
          displayName: 'Existing Proj',
          repositories: [
            {
              id: 'repo-1',
              workspaceSlug: 'default-ws',
              externalId: '100',
              fullName: 'org/my-repo',
              htmlUrl: null,
              description: null,
              defaultBranch: null,
              createdAt: '',
              updatedAt: '',
            },
          ],
          workspaceSlug: 'default-ws',
          defaultTags: ['tag1'],
          enabled: true,
          favorite: false,
        }}
        workspaceRepositories={[]}
      />
    );

    expect(screen.getByText('tag1')).toBeInTheDocument();
  });
});
