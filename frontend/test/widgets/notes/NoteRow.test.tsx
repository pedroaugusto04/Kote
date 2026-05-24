import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithAppProviders } from '../../../src/app/test-utils';
import { NoteRow } from '../../../src/widgets/notes/NoteRow';

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
});
