import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { updateNote } from '../../../src/shared/api/client';
import { renderWithAppProviders } from '../../../src/app/test-utils';
import { NoteRow } from '../../../src/widgets/notes/NoteRow';

vi.mock('../../../src/shared/api/client', () => ({
  updateNote: vi.fn().mockResolvedValue({ ok: true, noteId: 'note-3' }),
}));

afterEach(() => {
  cleanup();
});

describe('NoteRow', () => {
  it('shows edit and delete actions without opening the note row', () => {
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    renderWithAppProviders(
      <NoteRow
        dashboard={{
          workspaces: [],
          projects: [{ projectSlug: 'platform', displayName: 'Platform', repositories: [], workspaceSlug: 'default', defaultTags: [], enabled: true, favorite: false }],
          notes: [],
          reminders: [],
          home: { windowDays: 7, metrics: [], activityByDay: [], activityByProject: [], priorities: [], recentInterestingEvents: [] },
        }}
        note={{
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
          attachmentCount: 2,
        }}
        onDelete={onDelete}
        onEdit={onEdit}
        onOpen={onOpen}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit note Deploy antigo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete note Deploy antigo' }));

    const resolveButton = screen.getByRole('button', { name: 'Resolve note Deploy antigo' });
    const archiveButton = screen.getByRole('button', { name: 'Archive note Deploy antigo' });
    const editButton = screen.getByRole('button', { name: 'Edit note Deploy antigo' });
    const deleteButton = screen.getByRole('button', { name: 'Delete note Deploy antigo' });

    expect(screen.getByText('Event')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(resolveButton).toBeInTheDocument();
    expect(archiveButton).toBeInTheDocument();
    expect(editButton).toHaveAttribute('title', 'Edit');
    expect(deleteButton).toHaveAttribute('title', 'Delete');
    expect(resolveButton).toHaveAttribute('title', 'Resolve');
    expect(archiveButton).toHaveAttribute('title', 'Archive');
    expect(resolveButton.querySelector('svg')).not.toBeNull();
    expect(archiveButton.querySelector('svg')).not.toBeNull();
    expect(editButton.querySelector('svg')).not.toBeNull();
    expect(deleteButton.querySelector('svg')).not.toBeNull();
    expect(screen.getByLabelText('2 attachments')).toBeInTheDocument();
    expect(screen.queryByText('event')).not.toBeInTheDocument();
    expect(screen.queryByText('manual-api')).not.toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('shows reopen and unarchive actions for resolved and archived notes', () => {
    renderWithAppProviders(
      <NoteRow
        dashboard={{
          workspaces: [],
          projects: [{ projectSlug: 'platform', displayName: 'Platform', repositories: [], workspaceSlug: 'default', defaultTags: [], enabled: true, favorite: false }],
          notes: [],
          reminders: [],
          home: { windowDays: 7, metrics: [], activityByDay: [], activityByProject: [], priorities: [], recentInterestingEvents: [] },
        }}
        note={{
          id: 'note-2',
          path: '20 Inbox/platform/resolved.md',
          type: 'event',
          title: 'Resolvido',
          project: 'platform',
          workspace: 'default',
          folderId: null,
          tags: ['deploy'],
          date: '2026-04-27',
          status: 'resolved',
          summary: 'Resumo',
          source: 'manual-api',
          attachmentCount: 0,
        }}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Reopen note Resolvido' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve note Resolvido' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive note Resolvido' })).not.toBeInTheDocument();
  });

  it('shows an unarchive action for archived notes', async () => {
    const archivedNote = {
      id: 'note-3',
      path: '20 Inbox/platform/archived.md',
      type: 'event',
      title: 'Arquivada',
      project: 'platform',
      workspace: 'default',
      folderId: null,
      tags: ['deploy'],
      date: '2026-04-27',
      status: 'archived',
      summary: 'Resumo',
      source: 'manual-api',
      attachmentCount: 0,
      editor: { rawText: 'Resumo', reminderDate: '', reminderTime: '', reminderAt: '' },
    } as any;

    renderWithAppProviders(
      <NoteRow
        dashboard={{
          workspaces: [],
          projects: [{ projectSlug: 'platform', displayName: 'Platform', repositories: [], workspaceSlug: 'default', defaultTags: [], enabled: true, favorite: false }],
          notes: [],
          reminders: [],
          home: { windowDays: 7, metrics: [], activityByDay: [], activityByProject: [], priorities: [], recentInterestingEvents: [] },
        }}
        note={archivedNote}
        onOpen={vi.fn()}
      />,
    );

    const unarchiveButton = screen.getByRole('button', { name: 'Unarchive note Arquivada' });
    fireEvent.click(unarchiveButton);

    expect(screen.queryByRole('button', { name: 'Unarchive note Arquivada' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resolve note Arquivada' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive note Arquivada' })).toBeInTheDocument();
    await waitFor(() => {
      expect(updateNote).toHaveBeenCalledWith(
        'note-3',
        expect.objectContaining({
          status: 'active',
        }),
      );
    });
  });

  it('hides the attachment indicator when a note has no attachments', () => {
    renderWithAppProviders(
      <NoteRow
        dashboard={{
          workspaces: [],
          projects: [],
          notes: [],
          reminders: [],
          home: { windowDays: 7, metrics: [], activityByDay: [], activityByProject: [], priorities: [], recentInterestingEvents: [] },
        }}
        note={{
          id: 'note-1',
          path: '20 Inbox/platform/note.md',
          type: 'event',
          title: 'Sem anexo',
          project: 'platform',
          workspace: 'default',
          folderId: null,
          tags: [],
          date: '2026-04-27',
          status: 'active',
          summary: 'Resumo',
          source: 'manual-api',
          attachmentCount: 0,
        }}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/^\d+ attachments?$/)).not.toBeInTheDocument();
  });

  it('renders the source icon when a source is provided', () => {
    const { container } = renderWithAppProviders(
      <NoteRow
        dashboard={{
          workspaces: [],
          projects: [{ projectSlug: 'platform', displayName: 'Platform', repositories: [], workspaceSlug: 'default', defaultTags: [], enabled: true, favorite: false }],
          notes: [],
          reminders: [],
          home: { windowDays: 7, metrics: [], activityByDay: [], activityByProject: [], priorities: [], recentInterestingEvents: [] },
        }}
        note={{
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
          source: 'whatsapp-webhook',
          attachmentCount: 0,
        }}
        onOpen={vi.fn()}
      />,
    );

    const sourceElement = container.querySelector('.source-tag');
    expect(sourceElement).toBeInTheDocument();
    expect(sourceElement).toHaveAttribute('title', 'Source: WhatsApp');
    expect(sourceElement?.querySelector('svg')).toBeInTheDocument();
  });
});
