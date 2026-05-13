import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NoteRow } from '../../../src/widgets/notes/NoteRow';

afterEach(() => {
  cleanup();
});

describe('NoteRow', () => {
  it('shows edit and delete actions without opening the note row', () => {
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <NoteRow
        dashboard={{
          workspaces: [],
          projects: [{ projectSlug: 'platform', displayName: 'Platform', repositories: [], workspaceSlug: 'default', aliases: [], defaultTags: [], enabled: true }],
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

    fireEvent.click(screen.getByRole('button', { name: 'Editar nota Deploy antigo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir nota Deploy antigo' }));

    expect(screen.getByText('Evento')).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByLabelText('2 anexos')).toBeInTheDocument();
    expect(screen.queryByText('event')).not.toBeInTheDocument();
    expect(screen.queryByText('manual-api')).not.toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('hides the attachment indicator when a note has no attachments', () => {
    render(
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

    expect(screen.queryByLabelText(/anexo/)).not.toBeInTheDocument();
  });
});
