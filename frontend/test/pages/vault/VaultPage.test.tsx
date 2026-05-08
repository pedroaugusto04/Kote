import '@testing-library/jest-dom/vitest';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { VaultPage } from '../../../src/pages/vault/VaultPage';
import type { Dashboard } from '../../../src/shared/api/models/dashboard';

const apiSpies = vi.hoisted(() => ({
  fetchNote: vi.fn(),
  fetchNotes: vi.fn(),
}));

vi.mock('../../../src/shared/api/client', () => ({
  fetchNote: apiSpies.fetchNote,
  fetchNotes: apiSpies.fetchNotes,
}));

const dashboard: Dashboard = {
  workspaces: [{ workspaceSlug: 'default', displayName: 'Default' }],
  projects: [
    {
      projectSlug: 'platform',
      displayName: 'Platform',
      repositories: [],
      workspaceSlug: 'default',
      aliases: [],
      defaultTags: [],
      enabled: true,
    },
  ],
  notes: [
    {
      id: 'note-1',
      path: '20 Inbox/platform/note.md',
      type: 'event',
      title: 'Deploy antigo',
      project: 'platform',
      workspace: 'default',
      folderId: null,
      tags: ['deploy'],
      date: '2026-04-27',
      status: 'active',
      summary: 'Resumo',
      source: 'manual-api',
    },
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

describe('VaultPage', () => {
  it('does not render text edit/delete buttons in the note reader', async () => {
    apiSpies.fetchNotes.mockResolvedValue({
      ok: true,
      notes: dashboard.notes,
      pagination: {
        page: 1,
        pageSize: 5,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });
    apiSpies.fetchNote.mockResolvedValue({
      ...dashboard.notes[0],
      markdown: '# Deploy antigo\n\nConteudo',
      frontmatter: {},
      links: [],
      origin: 'manual-api',
      editor: null,
    });

    renderWithAppProviders(
      <VaultPage
        dashboard={dashboard}
        selectedProject="platform"
        selectedNoteId="note-1"
        setSelectedProject={vi.fn()}
        openNote={vi.fn()}
        editNote={vi.fn()}
        deleteNote={vi.fn()}
      />,
      { route: '/vault/note-1' },
    );

    expect(await screen.findByRole('heading', { name: 'Deploy antigo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar nota' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir nota' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar nota Deploy antigo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir nota Deploy antigo' })).toBeInTheDocument();
  });
});
