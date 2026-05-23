import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { VaultPage } from '../../../src/pages/vault/VaultPage';
import type { Dashboard } from '../../../src/shared/api/models/dashboard';
import type { NoteDetail, NoteSummary } from '../../../src/shared/api/models/note';

const apiSpies = vi.hoisted(() => ({
  fetchNote: vi.fn(),
  fetchNotes: vi.fn(),
}));

vi.mock('../../../src/shared/api/client', () => ({
  fetchNote: apiSpies.fetchNote,
  fetchNotes: apiSpies.fetchNotes,
}));

const baseDashboard: Dashboard = {
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
    {
      projectSlug: 'mobile',
      displayName: 'Mobile',
      repositories: [],
      workspaceSlug: 'default',
      defaultTags: [],
      enabled: true,
    },
  ],
  notes: [],
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
  apiSpies.fetchNote.mockReset();
  apiSpies.fetchNotes.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('VaultPage', () => {
  it('renders a focused reader without the side note list', async () => {
    const note = buildNoteSummary({ id: 'note-2', title: 'Deploy recente' });
    apiSpies.fetchNotes.mockResolvedValue(pageResult([note], { total: 1 }));
    apiSpies.fetchNote.mockResolvedValue(buildNoteDetail(note));

    renderVaultPage({ notes: [note], selectedNoteId: note.id });

    expect(await screen.findByRole('heading', { name: note.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: `Edit note ${note.title}` })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Delete note ${note.title}` })).not.toBeInTheDocument();
  });

  it('disables the previous button on the first note in the project', async () => {
    const notes = [
      buildNoteSummary({ id: 'note-3', title: 'Mais recente', date: '2026-05-03' }),
      buildNoteSummary({ id: 'note-2', title: 'Intermediaria', date: '2026-05-02' }),
    ];
    apiSpies.fetchNotes.mockResolvedValue(pageResult(notes, { total: 2 }));
    apiSpies.fetchNote.mockResolvedValue(buildNoteDetail(notes[0]));

    renderVaultPage({ notes, selectedNoteId: notes[0].id });

    expect(await screen.findByRole('heading', { name: notes[0].title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('disables the next button on the last note in the project', async () => {
    const notes = [
      buildNoteSummary({ id: 'note-3', title: 'Mais recente', date: '2026-05-03' }),
      buildNoteSummary({ id: 'note-2', title: 'Intermediaria', date: '2026-05-02' }),
    ];
    apiSpies.fetchNotes.mockResolvedValue(pageResult(notes, { total: 2 }));
    apiSpies.fetchNote.mockResolvedValue(buildNoteDetail(notes[1]));

    renderVaultPage({ notes, selectedNoteId: notes[1].id });

    expect(await screen.findByRole('heading', { name: notes[1].title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('opens the adjacent note inside the same page', async () => {
    const notes = [
      buildNoteSummary({ id: 'note-4', title: 'Hoje', date: '2026-05-04' }),
      buildNoteSummary({ id: 'note-3', title: 'Ontem', date: '2026-05-03' }),
      buildNoteSummary({ id: 'note-2', title: 'Antes', date: '2026-05-02' }),
    ];
    const openNote = vi.fn();
    apiSpies.fetchNotes.mockResolvedValue(pageResult(notes, { total: 3 }));
    apiSpies.fetchNote.mockResolvedValue(buildNoteDetail(notes[1]));

    renderVaultPage({ notes, openNote, selectedNoteId: notes[1].id });

    expect(await screen.findByRole('heading', { name: notes[1].title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(openNote).toHaveBeenNthCalledWith(1, notes[0].id);
    expect(openNote).toHaveBeenNthCalledWith(2, notes[2].id);
  });

  it('loads the adjacent page when navigating across a pagination boundary', async () => {
    const pageOne = [
      buildNoteSummary({ id: 'note-5', title: 'Mais recente', date: '2026-05-05' }),
      buildNoteSummary({ id: 'note-4', title: 'Quase recente', date: '2026-05-04' }),
      buildNoteSummary({ id: 'note-3', title: 'Ponte', date: '2026-05-03' }),
    ];
    const pageTwo = [
      buildNoteSummary({ id: 'note-2', title: 'Continua', date: '2026-05-02' }),
      buildNoteSummary({ id: 'note-1', title: 'Mais antiga', date: '2026-05-01' }),
    ];
    const openNote = vi.fn();
    apiSpies.fetchNotes
      .mockResolvedValueOnce(pageResult(pageOne, { page: 1, total: 5, totalPages: 2, hasNext: true }))
      .mockResolvedValueOnce(pageResult(pageTwo, { page: 2, total: 5, totalPages: 2, hasPrevious: true }));
    apiSpies.fetchNote.mockResolvedValue(buildNoteDetail(pageOne[2]));

    renderVaultPage({ notes: pageOne, openNote, selectedNoteId: pageOne[2].id });

    expect(await screen.findByRole('heading', { name: pageOne[2].title })).toBeInTheDocument();
    await waitFor(() => {
      expect(apiSpies.fetchNotes).toHaveBeenNthCalledWith(2, { page: 2, projectSlug: 'platform' });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(openNote).toHaveBeenCalledWith(pageTwo[0].id);
  });

  it('adopts the real project from the opened note for navigation', async () => {
    const foreignNote = buildNoteSummary({ id: 'mobile-2', title: 'Build iOS', project: 'mobile', date: '2026-05-02' });
    const mobileNotes = [
      buildNoteSummary({ id: 'mobile-3', title: 'Release iOS', project: 'mobile', date: '2026-05-03' }),
      foreignNote,
    ];
    const setSelectedProject = vi.fn();
    apiSpies.fetchNotes.mockResolvedValue(pageResult(mobileNotes, { total: 2 }));
    apiSpies.fetchNote.mockResolvedValue(buildNoteDetail(foreignNote));

    renderVaultPage({
      notes: [],
      selectedProject: 'platform',
      selectedNoteId: foreignNote.id,
      setSelectedProject,
    });

    expect(await screen.findByRole('heading', { name: foreignNote.title })).toBeInTheDocument();
    await waitFor(() => {
      expect(setSelectedProject).toHaveBeenCalledWith('mobile');
      expect(apiSpies.fetchNotes).toHaveBeenCalledWith({ page: 1, projectSlug: 'mobile', selectedId: foreignNote.id });
    });
  });

  it('renders image attachments inline and file attachments as links', async () => {
    const note = buildNoteSummary({ id: 'note-attachments', title: 'Note with attachments', attachmentCount: 2 });
    apiSpies.fetchNotes.mockResolvedValue(pageResult([note], { total: 1 }));
    apiSpies.fetchNote.mockResolvedValue({
      ...buildNoteDetail(note),
      attachments: [
        {
          id: 'image-1',
          fileName: 'erro.png',
          mimeType: 'image/png',
          sizeBytes: 2048,
          url: '/api/notes/note-attachments/attachments/image-1/content',
        },
        {
          id: 'file-1',
          fileName: 'relatorio.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 4096,
          url: '/api/notes/note-attachments/attachments/file-1/content',
        },
      ],
    });

    renderVaultPage({ notes: [note], selectedNoteId: note.id });

    expect(await screen.findByRole('heading', { name: note.title })).toBeInTheDocument();
    expect(screen.getByLabelText('2 attachments')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'erro.png' })).toHaveAttribute('src', '/api/notes/note-attachments/attachments/image-1/content');
    expect(screen.getByRole('link', { name: /relatorio.pdf/i })).toHaveAttribute('href', '/api/notes/note-attachments/attachments/file-1/content');
    expect(screen.getByText('application/pdf / 4.0 KB')).toBeInTheDocument();
  });

  it('does not render a duplicated original text block from structured note preamble', async () => {
    const note = buildNoteSummary({ id: 'note-structured', title: 'TCC reminder', summary: 'lembrar de chamar banca para o TCC amanha nesse horario' });
    apiSpies.fetchNotes.mockResolvedValue(pageResult([note], { total: 1 }));
    apiSpies.fetchNote.mockResolvedValue({
      ...buildNoteDetail(note),
      markdown: [
        '# TCC reminder',
        '',
        'Project: pedroaugusto04/TCC-Latex',
        '',
        '## Original text',
        '',
        'lembrar de chamar banca para o TCC amanha nesse horario',
        '',
        '## Summary',
        '',
        'lembrar de chamar banca para o TCC amanha nesse horario',
        '',
        '## Impact',
        '',
        'No impact registered.',
        '',
        '## Risks',
        '',
        '- none',
        '',
        '## Next steps',
        '',
        '- none',
      ].join('\n'),
      summary: 'lembrar de chamar banca para o TCC amanha nesse horario',
      editor: {
        canDelete: true,
        rawText: 'lembrar de chamar banca para o TCC amanha nesse horario',
        reminderDate: '',
        reminderTime: '',
      },
    });

    renderVaultPage({ notes: [note], selectedNoteId: note.id });

    expect(await screen.findByRole('heading', { name: note.title })).toBeInTheDocument();
    expect(screen.getAllByText('lembrar de chamar banca para o TCC amanha nesse horario')).toHaveLength(1);
    expect(screen.queryByText('Project: pedroaugusto04/TCC-Latex')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'AI summary' })).not.toBeInTheDocument();
  });
});

function renderVaultPage({
  notes,
  selectedProject = 'platform',
  selectedNoteId = '',
  setSelectedProject = vi.fn(),
  openNote = vi.fn(),
}: {
  notes: NoteSummary[];
  selectedProject?: string;
  selectedNoteId?: string;
  setSelectedProject?: (slug: string) => void;
  openNote?: (id: string) => void;
}) {
  return renderWithAppProviders(
    <VaultPage
      dashboard={{ ...baseDashboard, notes }}
      selectedProject={selectedProject}
      selectedNoteId={selectedNoteId}
      setSelectedProject={setSelectedProject}
      openProject={vi.fn()}
      openNote={openNote}
      editNote={vi.fn()}
      deleteNote={vi.fn()}
    />,
    { route: selectedNoteId ? `/vault/${selectedNoteId}` : '/vault' },
  );
}

function buildNoteSummary(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: 'note-1',
    path: `20 Inbox/${overrides.project || 'platform'}/note.md`,
    type: 'event',
    title: 'Nota',
    project: 'platform',
    workspace: 'default',
    folderId: null,
    tags: ['deploy'],
    date: '2026-05-01',
    status: 'active',
    summary: 'Resumo',
    source: 'manual-api',
    attachmentCount: 0,
    ...overrides,
  };
}

function buildNoteDetail(note: NoteSummary): NoteDetail {
  return {
    ...note,
    markdown: `# ${note.title}\n\nConteudo`,
    frontmatter: {},
    links: [],
    origin: 'manual-api',
    attachments: [],
    editor: null,
  };
}

function pageResult(notes: NoteSummary[], overrides: Partial<{ page: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean }> = {}) {
  const page = overrides.page ?? 1;
  const total = overrides.total ?? notes.length;
  const totalPages = overrides.totalPages ?? Math.max(1, Math.ceil(total / 5));

  return {
    ok: true as const,
    notes,
    pagination: {
      page,
      pageSize: 10,
      total,
      totalPages,
      hasNext: overrides.hasNext ?? page < totalPages,
      hasPrevious: overrides.hasPrevious ?? page > 1,
    },
  };
}
